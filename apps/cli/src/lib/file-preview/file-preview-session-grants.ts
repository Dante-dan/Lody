import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SessionId } from '@lody/shared';

/** A trusted host adapter resolves authentication, never a preview request body. */
export type FilePreviewAuthorizedSession = {
  readonly ownerSessionId: SessionId;
  readonly ownerUserId: string;
  readonly authorizationGeneration: string;
};

export type FilePreviewSessionGrantHost = {
  /** Return null on missing authentication, owner change, archive or revocation. */
  readonly resolveAuthorizedSession: (
    sessionId: SessionId
  ) => Promise<FilePreviewAuthorizedSession | null>;
  /** Explicit host-user confirmation of this exact canonical worktree root. */
  readonly confirmWorktreeRoot: (
    session: FilePreviewAuthorizedSession,
    canonicalRoot: string
  ) => Promise<boolean>;
};

type RootIdentity = {
  readonly root: string;
  readonly device: number;
  readonly inode: number;
  readonly birthtimeMs: number;
};

type Grant = {
  readonly id: string;
  readonly session: FilePreviewAuthorizedSession;
  readonly identity: RootIdentity;
};

export type FilePreviewSessionGrantAccess = {
  readonly ownerSessionId: SessionId;
  readonly roots: readonly string[];
  readonly isCurrent: () => Promise<boolean>;
};

function identityOf(root: string): RootIdentity | null {
  try {
    const canonical = fs.realpathSync(root);
    const stat = fs.statSync(canonical);
    // A filesystem without replacement identity must not silently inherit grants.
    if (!stat.isDirectory() || stat.ino === 0 || stat.birthtimeMs <= 0) return null;
    return { root: canonical, device: stat.dev, inode: stat.ino, birthtimeMs: stat.birthtimeMs };
  } catch {
    return null;
  }
}

function sameIdentity(expected: RootIdentity): boolean {
  const actual = identityOf(expected.root);
  return (
    actual !== null &&
    actual.root === expected.root &&
    actual.device === expected.device &&
    actual.inode === expected.inode &&
    actual.birthtimeMs === expected.birthtimeMs
  );
}

function sameSession(a: FilePreviewAuthorizedSession, b: FilePreviewAuthorizedSession): boolean {
  return (
    a.ownerSessionId === b.ownerSessionId &&
    a.ownerUserId === b.ownerUserId &&
    a.authorizationGeneration === b.authorizationGeneration
  );
}

/**
 * Reference host-owned grant lifecycle. No RPC exposes grant(), and no daemon
 * constructs this until authenticated host confirmation has an agreed adapter.
 * In-memory only: a new daemon starts with no grants. No Git/cwd/Markdown inference.
 */
export class FilePreviewSessionGrants {
  private readonly grants = new Map<SessionId, Grant>();
  private readonly epochs = new Map<SessionId, number>();

  constructor(private readonly host: FilePreviewSessionGrantHost) {}

  async grant(sessionId: SessionId, requestedRoot: string): Promise<string | null> {
    if (!path.isAbsolute(requestedRoot)) return null;
    const epoch = this.epochs.get(sessionId) ?? 0;
    const session = await this.resolveSession(sessionId);
    const identity = identityOf(requestedRoot);
    if (!session || !session.ownerUserId || !session.authorizationGeneration || !identity)
      return null;
    try {
      if (!(await this.host.confirmWorktreeRoot(session, identity.root))) return null;
    } catch {
      return null;
    }
    const current = await this.resolveSession(sessionId);
    if (
      !current ||
      !sameSession(session, current) ||
      !sameIdentity(identity) ||
      (this.epochs.get(sessionId) ?? 0) !== epoch
    )
      return null;
    const grant = { id: randomUUID(), session, identity };
    this.grants.set(sessionId, grant);
    return grant.id;
  }

  revoke(sessionId: SessionId): void {
    this.epochs.set(sessionId, (this.epochs.get(sessionId) ?? 0) + 1);
    this.grants.delete(sessionId);
  }

  async resolve(sessionId: SessionId): Promise<FilePreviewSessionGrantAccess | null> {
    const grant = this.grants.get(sessionId);
    if (!grant || !(await this.isCurrent(sessionId, grant))) return null;
    return {
      ownerSessionId: grant.session.ownerSessionId,
      roots: [grant.identity.root],
      isCurrent: () => this.isCurrent(sessionId, grant),
    };
  }

  private async resolveSession(sessionId: SessionId): Promise<FilePreviewAuthorizedSession | null> {
    try {
      return await this.host.resolveAuthorizedSession(sessionId);
    } catch {
      return null;
    }
  }

  private async isCurrent(sessionId: SessionId, grant: Grant): Promise<boolean> {
    const session = await this.resolveSession(sessionId);
    // Recheck after the async host boundary: revoke/regrant can race authentication.
    return (
      this.grants.get(sessionId) === grant &&
      session !== null &&
      sameSession(grant.session, session) &&
      sameIdentity(grant.identity)
    );
  }
}
