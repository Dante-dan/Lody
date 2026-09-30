import { useMemo, useState } from 'react';
import { atom, useAtomValue, useStore } from 'jotai';
import { selectAtom } from 'jotai/utils';
import { CheckCircle2, Circle, CircleX, LoaderCircle } from 'lucide-react';
import { Spinner } from '@/ui/spinner';
import { useTranslation } from 'react-i18next';
import {
  getSessionRoomId,
  isLoroRepoDocDeleted,
  type SessionId,
  type SessionMeta,
  type OperationProgressStatus,
} from '@lody/shared';

import { sessionMetaAtomFamily } from '@/atoms/doc-meta';
import { activeWorkspaceRuntimeAtom, type WorkspaceRuntime } from '@/atoms/runtime';
import { sessionLiveStatusAtomFamily } from '@/atoms/presence';
import { SessionRelationCard } from '@/components/shared/session-relation-card';
import type { SessionNavigationTarget } from '@/lib/session-navigation';
import { cn } from '@/lib/utils';

type CreatedSessionStatus = OperationProgressStatus;

const statusLabels = {
  created: 'sessions.openedBy.status.created',
  running: 'sessions.openedBy.status.running',
  succeeded: 'sessions.openedBy.status.succeeded',
  failed: 'sessions.openedBy.status.failed',
  cancelled: 'sessions.openedBy.status.cancelled',
} as const;
const selectSupervisedPermissionWait = (session: SessionMeta | null | undefined): boolean =>
  session?.openedSessionMode === 'supervised' &&
  !session.parentSessionId &&
  !!session.openedBySessionId &&
  typeof session.awaitingUserSince === 'number';

const selectSessionTitle = (session: SessionMeta | null | undefined): string | null =>
  session?.title?.trim() || null;

function canSettleWorker(
  meta: SessionMeta | null | undefined,
  status: CreatedSessionStatus,
  active: boolean
): boolean {
  return (
    meta?.openedSessionMode === 'supervised' &&
    !meta.parentSessionId &&
    !!meta.openedBySessionId &&
    meta.awaitingUserSince == null &&
    !active &&
    (status === 'succeeded' || status === 'failed')
  );
}

async function persistWorkerSettlement(
  runtime: WorkspaceRuntime,
  sessionId: SessionId,
  operationId: string,
  status: CreatedSessionStatus,
  isActive: () => boolean
): Promise<void> {
  const record = await runtime.repo.getDocMeta(getSessionRoomId(sessionId));
  const current = record?.meta as SessionMeta | undefined;
  if (
    !record ||
    isLoroRepoDocDeleted(record) ||
    current?.id !== sessionId ||
    current.userId !== runtime.accountId ||
    !canSettleWorker(current, status, isActive())
  )
    return;
  await runtime.writer.upsertDocMeta(getSessionRoomId(sessionId), {
    settledOpenedOperationId: operationId,
  });
}

type WorkerRosterItem = {
  target: { sessionId: SessionId };
  status: CreatedSessionStatus;
  label?: string;
  resultPreview?: string;
};

/** The creating Operation supplies terminal evidence; presence only fences resumed work. */
export function CreatedSessionWorkersRoster({
  operationId,
  items,
  onNavigateSession,
}: {
  operationId: string;
  items: readonly WorkerRosterItem[];
  onNavigateSession?: (target: SessionNavigationTarget) => void;
}) {
  const { t } = useTranslation();
  const store = useStore();
  const runtime = useAtomValue(activeWorkspaceRuntimeAtom);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const rosterAtom = useMemo(
    () =>
      atom((get) =>
        items.map((item) => {
          const meta = get(sessionMetaAtomFamily(getSessionRoomId(item.target.sessionId)));
          const canSettle = canSettleWorker(
            meta,
            item.status,
            get(sessionLiveStatusAtomFamily(item.target.sessionId)) != null
          );
          return {
            item,
            meta,
            canSettle,
            settled: canSettle && meta?.settledOpenedOperationId === operationId,
          };
        })
      ),
    [items, operationId]
  );
  const roster = useAtomValue(rosterAtom);
  const supervised = roster.filter(
    (row) => row.meta?.openedSessionMode === 'supervised' && !row.meta.parentSessionId
  );
  const eligible = supervised.filter(
    (row) => row.canSettle && !row.settled && row.meta?.userId === runtime?.accountId
  );
  const settleAll = async () => {
    if (!runtime) return;
    setSaving(true);
    setError(false);
    try {
      for (const { item } of eligible) {
        await persistWorkerSettlement(
          runtime,
          item.target.sessionId,
          operationId,
          item.status,
          () => store.get(sessionLiveStatusAtomFamily(item.target.sessionId)) != null
        );
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-2" data-session-create-progress="">
      {supervised.length > 0 && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          data-worker-roster-count={supervised.filter((row) => !row.settled).length}
        >
          <span>
            {t('sessions.openedBy.workers', 'Opened workers')} ·{' '}
            {supervised.filter((row) => !row.settled).length}
          </span>
          {eligible.length > 0 && (
            <button type="button" disabled={saving} onClick={() => void settleAll()}>
              {t('sessions.openedBy.settleAll', 'Settle finished workers')}
            </button>
          )}
        </div>
      )}
      {items.map((item) => (
        <CreatedSessionOperationCard
          key={item.target.sessionId}
          sessionId={item.target.sessionId}
          operationId={operationId}
          status={item.status}
          fallbackTitle={item.label}
          detail={item.resultPreview}
          onNavigateSession={onNavigateSession}
        />
      ))}
      {error && (
        <span role="alert">{t('sessions.openedBy.settleFailed', 'Could not settle worker')}</span>
      )}
    </div>
  );
}

/** A target Session's live title, falling back to the Operation's label. */
export function useOperationTargetTitle(sessionId: SessionId, fallbackTitle?: string): string {
  const { t } = useTranslation();
  const titleAtom = useMemo(
    () => selectAtom(sessionMetaAtomFamily(getSessionRoomId(sessionId)), selectSessionTitle),
    [sessionId]
  );
  const liveTitle = useAtomValue(titleAtom);
  return liveTitle || fallbackTitle?.trim() || t('sessions.untitled', 'Untitled session');
}

/** The status belongs to the creating Operation's target Turn, not later Session activity. */
export function CreatedSessionOperationCard({
  sessionId,
  fallbackTitle,
  status,
  detail,
  operationId,
  onNavigateSession,
}: {
  sessionId: SessionId;
  fallbackTitle?: string;
  status: CreatedSessionStatus;
  detail?: string;
  operationId?: string;
  onNavigateSession?: (target: SessionNavigationTarget) => void;
}) {
  const { t } = useTranslation();
  const title = useOperationTargetTitle(sessionId, fallbackTitle);
  const waitingAtom = useMemo(
    () =>
      selectAtom(
        sessionMetaAtomFamily(getSessionRoomId(sessionId)),
        selectSupervisedPermissionWait
      ),
    [sessionId]
  );
  const awaitingUser = useAtomValue(waitingAtom);
  const meta = useAtomValue(sessionMetaAtomFamily(getSessionRoomId(sessionId)));
  const liveStatus = useAtomValue(sessionLiveStatusAtomFamily(sessionId));
  const runtime = useAtomValue(activeWorkspaceRuntimeAtom);
  const store = useStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const canSettle = !!operationId && canSettleWorker(meta, status, liveStatus != null);
  const settled = canSettle && meta?.settledOpenedOperationId === operationId;
  const settle = async () => {
    if (!runtime || !canSettle || !operationId) return;
    setSaving(true);
    setError(false);
    try {
      // Re-read durable metadata; an old terminal creation card must never
      // settle a new permission wait or change a Session owned by someone else.
      await persistWorkerSettlement(
        runtime,
        sessionId,
        operationId,
        status,
        () => store.get(sessionLiveStatusAtomFamily(sessionId)) != null
      );
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  const StatusIcon =
    status === 'running'
      ? LoaderCircle
      : status === 'succeeded'
        ? CheckCircle2
        : status === 'failed'
          ? CircleX
          : Circle;

  return (
    <div data-supervised-worker-settled={settled ? '' : undefined}>
      {!settled && (
        <SessionRelationCard
          relation="opened"
          label={t('sessions.openedBy.createdSession', 'Session created')}
          sessionTitle={title}
          detail={detail}
          actionLabel={t('sessions.openedBy.viewSession', 'View session')}
          onAction={onNavigateSession ? () => onNavigateSession({ sessionId }) : undefined}
          status={
            <span
              role="status"
              data-session-creation-status={status}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 text-xs',
                status === 'failed'
                  ? 'text-destructive'
                  : status === 'succeeded'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
              )}
            >
              <Spinner
                icon={StatusIcon}
                spinning={status === 'running'}
                className="h-3 w-3 motion-reduce:animate-none"
                aria-hidden="true"
              />
              {t(statusLabels[status])}
              {awaitingUser && (
                <span data-worker-awaiting-user="">
                  · {t('sessions.openedBy.waitingOnYou', 'Waiting on you')}
                </span>
              )}
            </span>
          }
        />
      )}
      {settled ? (
        <button
          type="button"
          className="text-xs text-muted-foreground"
          onClick={() => onNavigateSession?.({ sessionId })}
        >
          {t('sessions.openedBy.settledWorker', 'Settled worker')} · {title}
        </button>
      ) : canSettle && runtime?.accountId === meta?.userId ? (
        <button
          type="button"
          disabled={saving}
          className="text-xs text-muted-foreground"
          onClick={() => void settle()}
        >
          {t('sessions.openedBy.settleWorker', 'Settle finished worker')}
        </button>
      ) : null}
      {error && (
        <span role="alert">{t('sessions.openedBy.settleFailed', 'Could not settle worker')}</span>
      )}
    </div>
  );
}
