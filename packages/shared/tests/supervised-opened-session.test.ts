import type { SessionMeta } from '../src/schema';
import type { SessionId } from '../src/ids';
import { describe, expect, it } from 'vitest';
import {
  projectOpenedSession,
  resolveOpenedSessionNotificationTarget,
  type OpenedSessionObservation,
} from '../src/supervised-opened-session';

const worker: OpenedSessionObservation = {
  sessionId: 'worker',
  relationship: { kind: 'supervised', openerSessionId: 'tab', openerRootSessionId: 'root' },
  phase: 'running',
  pendingPermissionRequestIds: [],
  unread: true,
  settled: false,
};

describe('draft supervised opened Session projection', () => {
  it('rolls completion up only to an addressable owned root and retains worker fallback', () => {
    const meta: SessionMeta = {
      id: 'worker' as SessionId,
      machineId: 'machine',
      userId: 'user',
      createdAt: '2026-09-30T00:00:00Z',
      cliType: 'builtin',
      agentType: 'codex',
      openedSessionMode: 'supervised',
      openedBySessionId: 'tab' as SessionId,
      openedByRootSessionId: 'root' as SessionId,
    };
    const opener: SessionMeta = { ...meta, id: 'root' as SessionId, openedSessionMode: undefined };
    expect(resolveOpenedSessionNotificationTarget(meta, opener, 'user')).toBe('root');
    for (const target of [
      undefined,
      { ...opener, isArchived: true },
      { ...opener, userId: 'another' },
      { ...opener, id: 'other' as SessionId },
      { ...opener, parentSessionId: 'top' as SessionId },
    ]) {
      expect(resolveOpenedSessionNotificationTarget(meta, target, 'user')).toBe('worker');
    }
    for (const candidate of [
      { ...meta, openedSessionMode: 'handoff' as const },
      { ...meta, openedSessionMode: undefined },
      { ...meta, parentSessionId: 'root' as SessionId },
    ]) {
      expect(resolveOpenedSessionNotificationTarget(candidate, opener, 'user')).toBe('worker');
    }
  });

  it('routes Tab-created workers to the root while preserving precise provenance and result', () => {
    const projection = projectOpenedSession(
      { ...worker, phase: 'completed', resultPreview: 'Updated the isolated project.' },
      'available'
    );
    expect(projection).toEqual({
      sessionId: 'worker',
      openerSessionId: 'tab',
      attentionSessionId: 'root',
      showPeerInbox: false,
      showInOpenerRoster: true,
      status: 'completed',
      pendingPermissionRequestIds: [],
      unread: true,
      resultPreview: 'Updated the isolated project.',
      canSettle: true,
    });
  });

  it.each(['unavailable', 'unknown'] as const)(
    'keeps permission attention when routing is %s',
    (route) => {
      const projection = projectOpenedSession(
        { ...worker, phase: 'completed', settled: true, pendingPermissionRequestIds: ['consent'] },
        route
      );
      expect(projection.attentionSessionId).toBe('worker');
      expect(projection.showPeerInbox).toBe(true);
      expect(projection.status).toBe('waiting_for_permission');
      expect(projection.pendingPermissionRequestIds).toEqual(['consent']);
      expect(projection.canSettle).toBe(false);
    }
  );

  it.each(['completed', 'failed'] as const)(
    'settles %s presentation without mutating source state',
    (phase) => {
      const source = { ...worker, phase, settled: true };
      expect(projectOpenedSession(source, 'available').showInOpenerRoster).toBe(false);
      expect(source).toEqual({ ...worker, phase, settled: true });
      expect(source.sessionId).toBe('worker');
    }
  );

  it.each(['running', 'unknown'] as const)('ignores stale settlement for %s work', (phase) => {
    const projection = projectOpenedSession({ ...worker, phase, settled: true }, 'available');
    expect(projection.showInOpenerRoster).toBe(true);
    expect(projection.canSettle).toBe(false);
    expect(projection.status).toBe(phase);
  });

  it.each([undefined, { kind: 'handoff' } as const])(
    'retains legacy and explicit peer presentation',
    (relationship) => {
      const projection = projectOpenedSession({ ...worker, relationship }, 'available');
      expect(projection.attentionSessionId).toBe('worker');
      expect(projection.showPeerInbox).toBe(true);
      expect(projection.showInOpenerRoster).toBe(false);
      expect(projection.canSettle).toBe(false);
    }
  );

  it('never hides a pending permission behind a stale settled bit', () => {
    const projection = projectOpenedSession(
      { ...worker, phase: 'failed', settled: true, pendingPermissionRequestIds: ['retry'] },
      'available'
    );
    expect(projection.showInOpenerRoster).toBe(true);
    expect(projection.status).toBe('waiting_for_permission');
    expect(projection.pendingPermissionRequestIds).toEqual(['retry']);
  });

  it('does not route malformed self-opening relationships back into the worker', () => {
    const projection = projectOpenedSession(
      {
        ...worker,
        relationship: {
          kind: 'supervised',
          openerSessionId: 'worker',
          openerRootSessionId: 'worker',
        },
      },
      'available'
    );
    expect(projection.showPeerInbox).toBe(true);
    expect(projection.showInOpenerRoster).toBe(false);
  });
});
