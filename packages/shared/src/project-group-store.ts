import type { MachineId, SessionId, WorkspaceId } from './ids';
import type { LocalProjectId } from './project';
import { projectGroupMemberKey, type ProjectGroup, type ProjectGroupMember } from './project-group';
import { getWorkspaceFlockDocId } from './workspace-flock-id';

export type ProjectGroupKey = ['projectGroup', string] | ['projectGroupMember', string, string];
export type ProjectGroupReadableFlock = {
  scan(options?: { readonly prefix?: readonly unknown[] }): Iterable<{
    readonly key: readonly unknown[];
    readonly value?: unknown;
  }>;
};
export type ProjectGroupWritableFlock = ProjectGroupReadableFlock & {
  set(key: ProjectGroupKey, value: unknown): void;
  delete(key: ProjectGroupKey): void;
  commit(): void;
};

const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseMember = (value: unknown): ProjectGroupMember | undefined => {
  if (!record(value)) return undefined;
  if (
    value.kind === 'localProject' &&
    nonempty(value.machineId) &&
    nonempty(value.localProjectId)
  ) {
    return {
      kind: 'localProject',
      machineId: value.machineId as MachineId,
      localProjectId: value.localProjectId as LocalProjectId,
    };
  }
  if (value.kind === 'session' && nonempty(value.sessionId)) {
    return { kind: 'session', sessionId: value.sessionId as SessionId };
  }
  return undefined;
};

/** Organization-only rows; resolution/access checking stays with existing readers. */
export function readProjectGroupsFromFlock(flock: ProjectGroupReadableFlock): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const row of flock.scan({ prefix: ['projectGroup'] })) {
    if (row.key.length !== 2 || !nonempty(row.key[1]) || !record(row.value)) continue;
    if (row.value.v !== 1 || row.value.id !== row.key[1] || !nonempty(row.value.name)) continue;
    groups.set(row.key[1], { id: row.key[1], name: row.value.name, members: [] });
  }
  for (const row of flock.scan({ prefix: ['projectGroupMember'] })) {
    if (row.key.length !== 3 || !nonempty(row.key[1]) || typeof row.key[2] !== 'string') continue;
    const group = groups.get(row.key[1]);
    const member = parseMember(row.value);
    if (!group || !member || projectGroupMemberKey(member) !== row.key[2]) continue;
    groups.set(group.id, { ...group, members: [...group.members, member] });
  }
  return [...groups.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
}

export type ProjectGroupChange =
  | { kind: 'upsert'; id: string; name: string }
  | { kind: 'add'; id: string; member: ProjectGroupMember }
  | { kind: 'remove'; id: string; member: ProjectGroupMember }
  | { kind: 'delete'; id: string };

/** Independent membership keys preserve unrelated concurrent additions. */
export function changeProjectGroupInFlock(
  flock: ProjectGroupWritableFlock,
  change: ProjectGroupChange
): boolean {
  if (!['upsert', 'add', 'remove', 'delete'].includes(change.kind)) {
    throw new Error('Invalid project group change');
  }
  if (!nonempty(change.id)) throw new Error('Invalid project group id');
  const groups = readProjectGroupsFromFlock(flock);
  const group = groups.find(({ id }) => id === change.id);
  if (change.kind === 'upsert') {
    if (!nonempty(change.name)) throw new Error('Invalid project group name');
    if (group?.name === change.name) return false;
    flock.set(['projectGroup', change.id], { v: 1, id: change.id, name: change.name });
  } else if (change.kind === 'delete') {
    if (!group) return false;
    for (const member of group.members) {
      flock.delete(['projectGroupMember', group.id, projectGroupMemberKey(member)]);
    }
    flock.delete(['projectGroup', group.id]);
  } else {
    const member = parseMember(change.member);
    if (!member) throw new Error('Invalid project group member');
    if (!group) throw new Error('Project group unavailable');
    const memberId = projectGroupMemberKey(member);
    const exists = group.members.some((item) => projectGroupMemberKey(item) === memberId);
    if (change.kind === 'add') {
      if (exists) return false;
      flock.set(['projectGroupMember', group.id, memberId], member);
    } else {
      if (!exists) return false;
      flock.delete(['projectGroupMember', group.id, memberId]);
    }
  }
  flock.commit();
  return true;
}

export type ProjectGroupRepo = {
  openFlockDoc(docId: string): Promise<{
    flock: ProjectGroupWritableFlock;
    syncOnce(): Promise<unknown>;
  }>;
  flush(): Promise<void>;
};

/** Resolve after local durability; an optional upload failure never rolls it back. */
export async function updateWorkspaceProjectGroup(
  repo: ProjectGroupRepo,
  workspaceId: WorkspaceId,
  change: ProjectGroupChange,
  options: { sync?: boolean } = {}
): Promise<{ changed: boolean; synced: boolean }> {
  const handle = await repo.openFlockDoc(getWorkspaceFlockDocId(workspaceId));
  if (!changeProjectGroupInFlock(handle.flock, change)) return { changed: false, synced: false };
  await repo.flush();
  if (options.sync === false) return { changed: true, synced: false };
  try {
    await handle.syncOnce();
    return { changed: true, synced: true };
  } catch {
    return { changed: true, synced: false };
  }
}
