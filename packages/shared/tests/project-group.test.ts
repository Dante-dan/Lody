import { describe, expect, it } from 'vitest';
import type { MachineId, SessionId, WorkspaceId } from '../src/ids';
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
    expect(
      resolveProjectGroupMembers(group, (member) => (member === a ? 'Available' : undefined))
    ).toEqual([
      { member: a, value: 'Available' },
      { member: b, value: undefined },
    ]);
    expect(group.members).toEqual([a, b]);
  });

  it('allows an unbound chat without assigning it a local project', () => {
    const chat: ProjectGroupMember = { kind: 'session', sessionId: 'chat' as SessionId };
    const group = addProjectGroupMember(addProjectGroupMember(empty, chat), local('a'));
    expect(removeProjectGroupMember(group, chat).members).toEqual([local('a')]);
    expect(chat).toEqual({ kind: 'session', sessionId: 'chat' });
  });
});

import {
  changeProjectGroupInFlock,
  readProjectGroupsFromFlock,
  updateWorkspaceProjectGroup,
  type ProjectGroupKey,
  type ProjectGroupWritableFlock,
} from '../src/project-group-store';

class GroupFlock implements ProjectGroupWritableFlock {
  rows = new Map<string, { key: readonly unknown[]; value: unknown }>();
  scan(options?: { readonly prefix?: readonly unknown[] }) {
    return [...this.rows.values()].filter(
      ({ key }) => options?.prefix?.every((part, index) => key[index] === part) ?? true
    );
  }
  set(key: ProjectGroupKey, value: unknown) {
    this.rows.set(JSON.stringify(key), { key, value });
  }
  delete(key: ProjectGroupKey) {
    this.rows.delete(JSON.stringify(key));
  }
  commit() {}
}

describe('workspace project group storage', () => {
  it('stores independent membership rows and leaves unrelated catalog rows untouched', () => {
    const left = new GroupFlock();
    const right = new GroupFlock();
    changeProjectGroupInFlock(left, { kind: 'upsert', id: 'group', name: 'Feature' });
    right.rows = new Map(left.rows);
    changeProjectGroupInFlock(left, { kind: 'add', id: 'group', member: local('a') });
    changeProjectGroupInFlock(right, { kind: 'add', id: 'group', member: local('b') });
    // Merge disjoint row changes, as Flock does; neither write replaces the membership list.
    left.rows = new Map([...left.rows, ...right.rows]);
    expect(readProjectGroupsFromFlock(left)[0]?.members).toEqual([local('a'), local('b')]);
    expect(changeProjectGroupInFlock(left, { kind: 'add', id: 'group', member: local('a') })).toBe(
      false
    );
    changeProjectGroupInFlock(left, { kind: 'remove', id: 'group', member: local('a') });
    expect(readProjectGroupsFromFlock(left)[0]?.members).toEqual([local('b')]);
    const catalog = { key: ['agentRole', 'role'], value: { name: 'existing' } };
    // Foreign families are not project-group write targets.
    left.rows.set('foreign', catalog);
    changeProjectGroupInFlock(left, { kind: 'delete', id: 'group' });
    expect(readProjectGroupsFromFlock(left)).toEqual([]);
    expect(left.rows.get('foreign')).toBe(catalog);
  });

  it('rejects invalid mutations before writing and ignores malformed or orphan stored rows', () => {
    const flock = new GroupFlock();
    expect(() =>
      changeProjectGroupInFlock(flock, { kind: 'upsert', id: 'group', name: ' ' })
    ).toThrow();
    expect(flock.rows.size).toBe(0);
    flock.set(['projectGroup', 'group'], { v: 1, id: 'group', name: 'Feature' });
    flock.set(['projectGroupMember', 'group', 'wrong-id'], local('a'));
    flock.set(['projectGroupMember', 'deleted', 'ignored'], local('b'));
    expect(readProjectGroupsFromFlock(flock)).toEqual([
      { id: 'group', name: 'Feature', members: [] },
    ]);
    expect(() =>
      changeProjectGroupInFlock(flock, {
        kind: 'add',
        id: 'missing',
        member: local('a'),
      })
    ).toThrow('Project group unavailable');
    expect(flock.rows.size).toBe(3);
  });

  it('opens the existing workspace document and retains locally durable changes after upload failure', async () => {
    const flock = new GroupFlock();
    const order: string[] = [];
    const repo = {
      async openFlockDoc(id: string) {
        order.push(id);
        return {
          flock,
          async syncOnce() {
            order.push('sync');
            throw new Error('offline');
          },
        };
      },
      async flush() {
        order.push('flush');
      },
    };
    expect(
      await updateWorkspaceProjectGroup(repo, 'ws' as WorkspaceId, {
        kind: 'upsert',
        id: 'group',
        name: 'Feature',
      })
    ).toEqual({ changed: true, synced: false });
    expect(order).toEqual(['ws:wf:workspace', 'flush', 'sync']);
    expect(readProjectGroupsFromFlock(flock)).toEqual([
      { id: 'group', name: 'Feature', members: [] },
    ]);
    await updateWorkspaceProjectGroup(
      repo,
      'ws' as WorkspaceId,
      {
        kind: 'add',
        id: 'group',
        member: local('a'),
      },
      { sync: false }
    );
    expect(order.slice(-2)).toEqual(['ws:wf:workspace', 'flush']);
    expect(readProjectGroupsFromFlock(flock)[0]?.members).toEqual([local('a')]);
  });
});
