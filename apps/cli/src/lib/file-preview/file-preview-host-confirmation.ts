import { randomUUID } from 'node:crypto';
import type { LocalSupervisorIdentity } from '../local-supervisor-control';
import type { FilePreviewAuthorizedSession } from './file-preview-session-grants';

type HostPeer = {
  connected: boolean;
  send: (message: unknown, callback: (error: Error | null) => void) => void;
  on: (event: 'message' | 'disconnect', listener: (message?: unknown) => void) => void;
  off: (event: 'message' | 'disconnect', listener: (message?: unknown) => void) => void;
};

let confirmHost:
  | ((session: FilePreviewAuthorizedSession, root: string) => Promise<boolean>)
  | null = null;

/** Installed only for the actual Electron parent; never accepts socket approval. */
export function registerFilePreviewHostConfirmation(
  identity: LocalSupervisorIdentity,
  peer: HostPeer
): () => void {
  if (identity.launchMode !== 'electron') return () => {};
  let busy = false;
  let cancel: (() => void) | null = null;
  const confirm = async (session: FilePreviewAuthorizedSession, root: string): Promise<boolean> => {
    if (busy || !peer.connected) return false;
    busy = true;
    const challengeId = randomUUID();
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (approved: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.off('message', onMessage);
        peer.off('disconnect', onDisconnect);
        cancel = null;
        busy = false;
        resolve(approved);
      };
      const onDisconnect = () => finish(false);
      const onMessage = (value?: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return;
        const message = value as Record<string, unknown>;
        if (
          message.type !== 'lody/preview-confirmation-result' ||
          message.challengeId !== challengeId ||
          message.instanceId !== identity.instanceId ||
          message.token !== identity.token
        )
          return;
        finish(message.approved === true);
      };
      const timer = setTimeout(() => finish(false), 30_000);
      cancel = onDisconnect;
      peer.on('message', onMessage);
      peer.on('disconnect', onDisconnect);
      peer.send(
        {
          type: 'lody/preview-confirmation',
          instanceId: identity.instanceId,
          token: identity.token,
          challengeId,
          sessionId: session.ownerSessionId,
          ownerUserId: session.ownerUserId,
          canonicalRoot: root,
        },
        (error) => {
          if (error) finish(false);
        }
      );
    });
  };
  confirmHost = confirm;
  return () => {
    cancel?.();
    if (confirmHost === confirm) confirmHost = null;
  };
}

export async function confirmFilePreviewRootOnHost(
  session: FilePreviewAuthorizedSession,
  root: string
): Promise<boolean> {
  return (await confirmHost?.(session, root)) ?? false;
}
