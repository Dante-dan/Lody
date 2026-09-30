import { describe, expect, it } from 'vitest';
import {
  projectOpenedSession,
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
