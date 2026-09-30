import { getEffectiveSessionActivitySummary as getTaskActivitySummary } from '../src/components/sessions/session-tasklist-mapping';
import { describe, expect, test } from 'vitest';

import type { MachineId, SessionId, SessionMeta, SessionStatus } from '@lody/shared';

import {
  buildChildSessionsByParent,
  buildSessionAttentionByRoot,
  buildSessionListRows,
  getEffectiveLatestMessageAt,
  getEffectiveSessionActivitySummary,
} from '../src/components/sessions/session-list-rows';

const machineId = 'machine-1' as MachineId;

function makeSession(overrides: Partial<SessionMeta> & { id: string }): SessionMeta {
  return {
    id: overrides.id as SessionId,
    machineId,
    createdAt: '2026-05-09T10:00:00.000Z',
    userId: 'user-1',
    cliType: 'builtin',
    agentType: 'codex',
    ...overrides,
  } as SessionMeta;
}

describe('getEffectiveLatestMessageAt', () => {
  test('returns session lastMessageAt when there are no children', () => {
    const session = makeSession({
      id: 'parent',
      lastMessageAt: 1_000,
    });
    expect(getEffectiveLatestMessageAt(session, new Map())).toBe(1_000);
  });

  test('falls back to createdAt when lastMessageAt is missing', () => {
    const session = makeSession({
      id: 'parent',
      createdAt: '2026-05-09T10:00:00.000Z',
    });
    const expected = Date.parse('2026-05-09T10:00:00.000Z');
    expect(getEffectiveLatestMessageAt(session, new Map())).toBe(expected);
  });

  test('returns the max of the session and its children', () => {
    const parent = makeSession({ id: 'parent', lastMessageAt: 1_000 });
    const childA = makeSession({
      id: 'child-a',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 5_000,
    });
    const childB = makeSession({
      id: 'child-b',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 3_000,
    });
    const map = buildChildSessionsByParent([parent, childA, childB]);
    expect(getEffectiveLatestMessageAt(parent, map)).toBe(5_000);
  });

  test('keeps parent time when no child has a newer message', () => {
    const parent = makeSession({ id: 'parent', lastMessageAt: 10_000 });
    const child = makeSession({
      id: 'child-a',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 5_000,
    });
    const map = buildChildSessionsByParent([parent, child]);
    expect(getEffectiveLatestMessageAt(parent, map)).toBe(10_000);
  });

  test('ignores archived children', () => {
    const parent = makeSession({ id: 'parent', lastMessageAt: 1_000 });
    const liveChild = makeSession({
      id: 'child-live',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 2_000,
    });
    const archivedChild = makeSession({
      id: 'child-archived',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 9_000,
      isArchived: true,
    });
    const map = buildChildSessionsByParent([parent, liveChild, archivedChild]);
    expect(getEffectiveLatestMessageAt(parent, map)).toBe(2_000);
  });
});

describe('buildSessionListRows child-time aggregation', () => {
  test("parent task's latestMessageAt reflects the most recent child activity", () => {
    const parent = makeSession({ id: 'parent', lastMessageAt: 1_000, title: 'Parent' });
    const child = makeSession({
      id: 'child',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 4_000,
    });

    const tasks = buildSessionListRows(
      [parent],
      {
        scope: 'my',
        currentUserId: 'user-1',
        defaultTitle: 'Untitled',
      },
      [parent, child]
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.latestMessageAt).toBe(4_000);
  });

  test('parent task keeps its own time when newer than all children', () => {
    const parent = makeSession({ id: 'parent', lastMessageAt: 7_000, title: 'Parent' });
    const child = makeSession({
      id: 'child',
      parentSessionId: 'parent' as SessionId,
      lastMessageAt: 2_000,
    });

    const tasks = buildSessionListRows(
      [parent],
      {
        scope: 'my',
        currentUserId: 'user-1',
        defaultTitle: 'Untitled',
      },
      [parent, child]
    );

    expect(tasks[0]?.latestMessageAt).toBe(7_000);
  });

  test('parent task is working when a child has live presence', () => {
    const parent = makeSession({
      id: 'parent',
      title: 'Parent',
      status: { type: 'idle' },
    });
    const child = makeSession({
      id: 'child',
      parentSessionId: 'parent' as SessionId,
      status: { type: 'idle' },
    });
    const liveSessionStatuses = new Map<string, SessionStatus>([[child.id, { type: 'running' }]]);

    const tasks = buildSessionListRows(
      [parent],
      {
        scope: 'my',
        currentUserId: 'user-1',
        defaultTitle: 'Untitled',
        liveSessionStatuses,
      },
      [parent, child]
    );

    expect(tasks[0]?.isWorking).toBe(true);
  });

  test('does not treat durable running status as working without live presence', () => {
    const session = makeSession({
      id: 'session',
      title: 'Session',
      status: { type: 'running' },
      lastRunningSeen: Date.now(),
    });

    const tasks = buildSessionListRows([session], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(tasks[0]?.isWorking).toBe(false);
  });
});

describe('getEffectiveSessionActivitySummary child-status aggregation', () => {
  test('rolls child running, permission, unread, and latest message state into the parent', () => {
    const now = Date.now();
    const parent = makeSession({
      id: 'parent',
      status: { type: 'idle' },
      lastMessageAt: now - 10_000,
      lastReadAt: now,
    });
    const runningChild = makeSession({
      id: 'child-running',
      parentSessionId: parent.id,
      status: { type: 'idle' },
      lastMessageAt: now - 5_000,
      lastReadAt: now,
    });
    const permissionChild = makeSession({
      id: 'child-permission',
      parentSessionId: parent.id,
      status: { type: 'idle' },
      lastMessageAt: now - 2_000,
      lastReadAt: now - 3_000,
    });
    const map = buildChildSessionsByParent([parent, runningChild, permissionChild]);
    const liveSessionStatuses = new Map<string, SessionStatus>([
      [runningChild.id, { type: 'running' }],
      [permissionChild.id, { type: 'requestPermission' }],
    ]);

    const activity = getEffectiveSessionActivitySummary(parent, map, liveSessionStatuses);

    expect(activity).toMatchObject({
      isWorking: true,
      isWaitingPermission: true,
      hasUnreadMessages: true,
    });
    expect(activity.latestMessageAt).toBe(permissionChild.lastMessageAt);
  });

  test('marks the parent working when a child session has live presence', () => {
    const parent = makeSession({
      id: 'parent',
      status: { type: 'idle' },
      lastRunningSeen: 1,
    });
    const child = makeSession({
      id: 'child',
      parentSessionId: 'parent' as SessionId,
      status: { type: 'idle' },
    });
    const map = buildChildSessionsByParent([parent, child]);
    const liveSessionStatuses = new Map<string, SessionStatus>([[child.id, { type: 'running' }]]);

    expect(getEffectiveSessionActivitySummary(parent, map, liveSessionStatuses).isWorking).toBe(
      true
    );
  });

  test('marks the parent waiting when a child session has live permission presence', () => {
    const parent = makeSession({
      id: 'parent',
      status: { type: 'idle' },
    });
    const child = makeSession({
      id: 'child',
      parentSessionId: 'parent' as SessionId,
      status: { type: 'idle' },
    });
    const map = buildChildSessionsByParent([parent, child]);
    const liveSessionStatuses = new Map<string, SessionStatus>([
      [child.id, { type: 'requestPermission' }],
    ]);

    expect(
      getEffectiveSessionActivitySummary(parent, map, liveSessionStatuses).isWaitingPermission
    ).toBe(true);
  });

  test('ignores archived child status when building the child lookup', () => {
    const now = Date.now();
    const parent = makeSession({
      id: 'parent',
      status: { type: 'idle' },
      lastMessageAt: now - 10_000,
      lastReadAt: now,
    });
    const archivedChild = makeSession({
      id: 'archived-child',
      parentSessionId: parent.id,
      isArchived: true,
      status: { type: 'requestPermission' },
      lastRunningSeen: now,
      lastMessageAt: now,
    });
    const map = buildChildSessionsByParent([parent, archivedChild]);

    expect(getEffectiveSessionActivitySummary(parent, map)).toEqual({
      isWorking: false,
      isWaitingPermission: false,
      hasUnreadMessages: false,
      latestMessageAt: parent.lastMessageAt,
    });
  });
});

describe('buildSessionListRows repo + PR mapping', () => {
  test('resolves repoFullName from a github project when legacy repoFullName is absent', () => {
    const session = makeSession({
      id: 'session',
      title: 'GitHub session',
      project: { kind: 'github', repoFullName: 'loro-dev/lody', branch: 'main' },
    });

    const tasks = buildSessionListRows([session], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(tasks[0]?.repoFullName).toBe('loro-dev/lody');
  });

  test('resolves repoFullName from a local project linked to a GitHub repo', () => {
    const session = makeSession({
      id: 'session',
      title: 'Local session',
      project: {
        kind: 'local',
        localProjectId: 'project-1',
        githubRepoFullName: 'loro-dev/lody',
      },
    });

    const tasks = buildSessionListRows([session], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(tasks[0]?.repoFullName).toBe('loro-dev/lody');
  });

  test('falls back to the legacy repoFullName when there is no project', () => {
    const session = makeSession({
      id: 'session',
      title: 'Legacy session',
      repoFullName: 'loro-dev/lody',
    });

    const tasks = buildSessionListRows([session], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(tasks[0]?.repoFullName).toBe('loro-dev/lody');
  });

  test('maps the latest pull request onto the task', () => {
    const session = makeSession({
      id: 'session',
      title: 'PR session',
      project: { kind: 'github', repoFullName: 'loro-dev/lody', branch: 'main' },
      pullRequests: [{ url: 'https://github.com/loro-dev/lody/pull/42', status: 'open' }],
      pullRequestState: {
        'https://github.com/loro-dev/lody/pull/42': {
          s: 's',
          m: 'c',
          t: 1_752_000_000,
        },
      },
    });

    const tasks = buildSessionListRows([session], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(tasks[0]?.prUrl).toBe('https://github.com/loro-dev/lody/pull/42');
    expect(tasks[0]?.prNumber).toBe(42);
    expect(tasks[0]?.prStatus).toBe('open');
    expect(tasks[0]?.prCiState).toBe('s');
    expect(tasks[0]?.prReadiness).toBe('y');
  });

  test('derives no readiness when the PR merge state is not clean', () => {
    const session = makeSession({
      id: 'session',
      title: 'PR session',
      project: { kind: 'github', repoFullName: 'loro-dev/lody', branch: 'main' },
      pullRequests: [{ url: 'https://github.com/loro-dev/lody/pull/42', status: 'open' }],
      pullRequestState: {
        'https://github.com/loro-dev/lody/pull/42': {
          s: 's',
          m: 'b',
          // Stale legacy readiness: must be ignored, never re-authorize merge.
          r: 'y',
          t: 1_752_000_000,
        },
      },
    });

    const tasks = buildSessionListRows([session], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(tasks[0]?.prReadiness).toBeNull();
  });
});

describe('buildSessionListRows opened-by provenance', () => {
  test('carries openedBySessionId onto the row so the sidebar can nest it', () => {
    const opener = makeSession({ id: 'opener' });
    const opened = makeSession({
      id: 'opened',
      openedBySessionId: 'opener' as SessionId,
    });

    const rows = buildSessionListRows([opener, opened], {
      scope: 'my',
      currentUserId: 'user-1',
      defaultTitle: 'Untitled',
    });

    expect(rows.find((row) => row.sessionId === 'opener')?.openedBySessionId).toBeNull();
    expect(rows.find((row) => row.sessionId === 'opened')?.openedBySessionId).toBe('opener');
  });

  test('a parentSessionId child keeps its own child aggregation and is not confused with an opened session', () => {
    // The sidebar never receives child sessions (they are filtered upstream by
    // `sessionListAtom`), but a child that also carries `openedBySessionId`
    // must still roll up as a child rather than being re-parented by it.
    const parent = makeSession({ id: 'parent', lastMessageAt: 1_000 });
    const child = makeSession({
      id: 'child',
      parentSessionId: 'parent' as SessionId,
      openedBySessionId: 'parent' as SessionId,
      lastMessageAt: 5_000,
    });

    const rows = buildSessionListRows(
      [parent],
      { scope: 'my', currentUserId: 'user-1', defaultTitle: 'Untitled' },
      [parent, child]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionId).toBe('parent');
    expect(rows[0]?.latestMessageAt).toBe(5_000);
  });
});

describe.each([getEffectiveSessionActivitySummary, getTaskActivitySummary])(
  'closed conversation activity',
  (summarize) => {
    test('ignores closed output while retaining live status and open child unread', () => {
      const parent = makeSession({ id: 'parent', isTabClosed: true, lastMessageAt: 100 });
      const child = makeSession({
        id: 'child',
        parentSessionId: parent.id,
        isTabClosed: true,
        lastMessageAt: 200,
      });
      const children = new Map([[parent.id, [child]]]);
      const presence = new Map<string, SessionStatus>([[child.id, { type: 'requestPermission' }]]);
      expect(summarize(parent, children, presence)).toMatchObject({
        hasUnreadMessages: false,
        isWorking: true,
        isWaitingPermission: true,
        latestMessageAt: 200,
      });
      child.isTabClosed = false;
      expect(summarize(parent, children, presence).hasUnreadMessages).toBe(true);
      child.lastReadAt = 200;
      expect(summarize(parent, children, presence).hasUnreadMessages).toBe(false);
    });
  }
);

describe.each([getEffectiveSessionActivitySummary, getTaskActivitySummary])(
  'supervised attention roll-up',
  (summarize) => {
    test('rolls unread and durable consent to the owned root without marking a worker read', () => {
      const root = makeSession({ id: 'root', lastMessageAt: 1, lastReadAt: 1 });
      const worker = makeSession({
        id: 'worker',
        openedSessionMode: 'supervised',
        openedBySessionId: 'tab' as SessionId,
        openedByRootSessionId: root.id,
        lastMessageAt: 20,
        lastReadAt: 10,
        awaitingUserSince: 15,
      });
      const tab = makeSession({
        id: 'worker-tab',
        parentSessionId: worker.id,
        lastMessageAt: 30,
        lastReadAt: 30,
      });
      const sessions = [root, worker, tab];
      const children = buildSessionAttentionByRoot(sessions);
      expect(summarize(root, children)).toEqual({
        isWorking: false,
        isWaitingPermission: true,
        hasUnreadMessages: true,
        latestMessageAt: 30,
      });
      expect(worker.lastReadAt).toBe(10);
      worker.awaitingUserSince = undefined;
      worker.lastReadAt = 20;
      expect(summarize(root, children)).toMatchObject({
        isWaitingPermission: false,
        hasUnreadMessages: false,
      });
      tab.lastMessageAt = 40;
      expect(summarize(root, children).hasUnreadMessages).toBe(true);
    });
    test.each([
      'legacy',
      'handoff',
      'archived-root',
      'foreign-root',
      'missing-root',
      'closed-root',
    ])('keeps %s worker attention independent', (mode) => {
      const root = makeSession({
        id: 'root',
        lastMessageAt: 1,
        lastReadAt: 1,
        isArchived: mode === 'archived-root',
        isTabClosed: mode === 'closed-root',
        userId: mode === 'foreign-root' ? 'someone-else' : 'user-1',
      });
      const worker = makeSession({
        id: 'worker',
        lastMessageAt: 20,
        openedSessionMode:
          mode === 'legacy' ? undefined : mode === 'handoff' ? 'handoff' : 'supervised',
        openedByRootSessionId: root.id,
      });
      const map = buildSessionAttentionByRoot(mode === 'missing-root' ? [worker] : [root, worker]);
      expect(summarize(root, map).hasUnreadMessages).toBe(false);
      expect(summarize(worker, map).hasUnreadMessages).toBe(true);
    });
  }
);
