import type { SessionMeta } from './schema';
import type { SessionId } from './ids';

/** Reference projection for the draft supervised-opened-sessions contract.
 * Deliberately not wired into persisted SessionMeta or production consumers.
 */
export type OpenedSessionRelationship =
  | { kind: 'supervised'; openerSessionId: string; openerRootSessionId: string }
  | { kind: 'handoff' };

export type OpenedSessionObservation = {
  sessionId: string;
  relationship?: OpenedSessionRelationship;
  phase: 'running' | 'completed' | 'failed' | 'unknown';
  pendingPermissionRequestIds: readonly string[];
  unread: boolean;
  resultPreview?: string;
  settled: boolean;
};

export type OpenedSessionProjection = {
  sessionId: string;
  openerSessionId?: string;
  attentionSessionId: string;
  showPeerInbox: boolean;
  showInOpenerRoster: boolean;
  status: 'running' | 'waiting_for_permission' | 'completed' | 'failed' | 'unknown';
  pendingPermissionRequestIds: readonly string[];
  unread: boolean;
  resultPreview?: string;
  canSettle: boolean;
};

/** Availability means the attention destination can be addressed, not machine presence.
 * An unavailable/unknown route preserves the worker's own inbox. This function
 * neither answers permissions nor archives/deletes Session documents.
 */
export function projectOpenedSession(
  worker: OpenedSessionObservation,
  openerRoute: 'available' | 'unavailable' | 'unknown'
): OpenedSessionProjection {
  const relation = worker.relationship;
  const supervised = relation?.kind === 'supervised';
  const routeToOpener =
    supervised &&
    openerRoute === 'available' &&
    relation.openerRootSessionId.length > 0 &&
    relation.openerRootSessionId !== worker.sessionId &&
    relation.openerSessionId.length > 0 &&
    relation.openerSessionId !== worker.sessionId;
  const hasPermissions = worker.pendingPermissionRequestIds.length > 0;
  const finished = worker.phase === 'completed' || worker.phase === 'failed';
  const canSettle = supervised && finished && !hasPermissions;
  // Ignore a stale settle bit when work resumes or a permission wait appears.
  const settled = worker.settled && canSettle;

  return {
    sessionId: worker.sessionId,
    openerSessionId: supervised ? relation.openerSessionId : undefined,
    attentionSessionId: routeToOpener ? relation.openerRootSessionId : worker.sessionId,
    showPeerInbox: !routeToOpener,
    showInOpenerRoster: routeToOpener && !settled,
    status: hasPermissions ? 'waiting_for_permission' : worker.phase,
    pendingPermissionRequestIds: [...worker.pendingPermissionRequestIds],
    unread: worker.unread,
    resultPreview: worker.resultPreview,
    canSettle,
  };
}

/** Routine completion may roll up only to a known, active root owned by its recipient.
 * Permission request/response identities remain on the worker, independently of this route.
 */
export function resolveOpenedSessionNotificationTarget(
  worker: SessionMeta,
  opener: SessionMeta | undefined,
  recipientUserId: string
): SessionId {
  const rootId = worker.openedByRootSessionId ?? worker.openedBySessionId;
  return worker.openedSessionMode === 'supervised' &&
    !worker.parentSessionId &&
    rootId &&
    rootId !== worker.id &&
    opener?.id === rootId &&
    !opener.parentSessionId &&
    opener.isArchived !== true &&
    opener.isTabClosed !== true &&
    opener.userId === recipientUserId
    ? opener.id
    : worker.id;
}
