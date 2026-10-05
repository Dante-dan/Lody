import type { SessionMeta } from './schema';

/** A pin transition is durable metadata, independent of conversation activity. */
export function getSessionPinUpdate(
  meta: Pick<SessionMeta, 'isPinned' | 'pinnedAt'>,
  isPinned: boolean,
  now: number
): Pick<SessionMeta, 'isPinned' | 'pinnedAt'> {
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid pin timestamp');
  return {
    isPinned,
    // Unpin preserves the old timestamp, but a subsequent pin starts a new rank.
    pinnedAt: isPinned && !meta.isPinned ? now : meta.pinnedAt,
  };
}

/** Compare two pinned rows only. Legacy pins sort last, by stable session id. */
export function comparePinnedSessions(
  a: { id: string; pinnedAt?: number },
  b: { id: string; pinnedAt?: number }
): number {
  const timestamp = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : -1;
  const byPin = timestamp(b.pinnedAt) - timestamp(a.pinnedAt);
  return byPin || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
