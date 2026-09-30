import type { MachineId, SessionId } from './ids';
import type { LocalProjectId } from './project';

/** Organization references for #1144; execution ownership stays with existing objects. */
export type ProjectGroupMember =
  | { kind: 'localProject'; machineId: MachineId; localProjectId: LocalProjectId }
  | { kind: 'session'; sessionId: SessionId };

export type ProjectGroup = {
  id: string;
  name: string;
  members: readonly ProjectGroupMember[];
};

/** A directory's display name or root path is never its cross-machine identity. */
export function projectGroupMemberKey(member: ProjectGroupMember): string {
  return member.kind === 'localProject'
    ? JSON.stringify([member.kind, member.machineId, member.localProjectId])
    : JSON.stringify([member.kind, member.sessionId]);
}

/** Organization changes do not mutate the referenced execution objects. */
export function addProjectGroupMember(
  group: ProjectGroup,
  member: ProjectGroupMember
): ProjectGroup {
  const key = projectGroupMemberKey(member);
  if (group.members.some((existing) => projectGroupMemberKey(existing) === key)) return group;
  return { ...group, members: [...group.members, { ...member }] };
}

export function removeProjectGroupMember(
  group: ProjectGroup,
  member: ProjectGroupMember
): ProjectGroup {
  const key = projectGroupMemberKey(member);
  const members = group.members.filter((existing) => projectGroupMemberKey(existing) !== key);
  return members.length === group.members.length ? group : { ...group, members };
}

/** Resolution is separate from membership: offline/unavailable references survive. */
export function resolveProjectGroupMembers<T>(
  group: ProjectGroup,
  resolve: (member: ProjectGroupMember) => T | undefined
): { member: ProjectGroupMember; value: T | undefined }[] {
  return group.members.map((member) => ({ member, value: resolve(member) }));
}
