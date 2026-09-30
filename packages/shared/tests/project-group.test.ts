import { describe, expect, it } from 'vitest';
import type { MachineId, SessionId } from '../src/ids';
import type { LocalProjectId } from '../src/project';
import {
  addProjectGroupMember,
  removeProjectGroupMember,
  resolveProjectGroupMembers,
  type ProjectGroup,
  type ProjectGroupMember,
} from '../src/project-group';

const local = (machineId: string): ProjectGroupMember => ({
  kind: 'localProject',
  machineId: machineId as MachineId,
  localProjectId: 'project' as LocalProjectId,
});
const empty: ProjectGroup = { id: 'group', name: 'Feature', members: [] };

describe('project grouping reference model', () => {
  it('distinguishes identical local project ids on different machines and removes exactly one', () => {
    const a = local('a');
    const b = local('b');
    const group = addProjectGroupMember(addProjectGroupMember(empty, a), b);
    expect(group.members).toEqual([a, b]);
    expect(addProjectGroupMember(group, a)).toBe(group);
    expect(removeProjectGroupMember(group, a).members).toEqual([b]);
    expect(group.members).toEqual([a, b]);
    expect(empty.members).toEqual([]);
  });

  it('retains unavailable membership without guessing a machine or deleting the member', () => {
    const a = local('a');
    const b = local('b');
    const group = { ...empty, members: [a, b] };
    expect(resolveProjectGroupMembers(group, (member) => member === a ? 'Available' : undefined))
      .toEqual([{ member: a, value: 'Available' }, { member: b, value: undefined }]);
    expect(group.members).toEqual([a, b]);
  });

  it('allows an unbound chat without assigning it a local project', () => {
    const chat: ProjectGroupMember = { kind: 'session', sessionId: 'chat' as SessionId };
    const group = addProjectGroupMember(addProjectGroupMember(empty, chat), local('a'));
    expect(removeProjectGroupMember(group, chat).members).toEqual([local('a')]);
    expect(chat).toEqual({ kind: 'session', sessionId: 'chat' });
  });
});
