import { useSyncExternalStore } from 'react';
import type { SessionInputBlock } from '@lody/shared';
import type { SessionFileTransferProgress } from '@/lib/session-file-upload';

export type AttachmentProgress = SessionFileTransferProgress & {
  fileName: string;
  index: number;
  count: number;
};
type Phase = 'uploading' | 'upload-failed' | 'submitting' | 'submit-failed';
export interface PendingAttachmentSubmission {
  sessionId: string;
  ownerId: string;
  workspaceSlug: string;
  returnHref: string;
  onReturnToEdit?: () => void;
  text: string;
  phase: Phase;
  progress?: AttachmentProgress;
  retry: () => void;
  cancel: () => void;
}
let pending: readonly PendingAttachmentSubmission[] = [];
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const usePendingAttachmentSubmissions = () =>
  useSyncExternalStore(
    subscribe,
    () => pending,
    () => pending
  );

/** Upload ownership outlives route mounts. Nothing is durable or dispatchable until acceptance. */
export function beginPendingAttachmentSubmission(
  identity: Pick<
    PendingAttachmentSubmission,
    'sessionId' | 'ownerId' | 'workspaceSlug' | 'returnHref' | 'text' | 'onReturnToEdit'
  >,
  upload: (
    signal: AbortSignal,
    report: (progress: AttachmentProgress) => void
  ) => Promise<SessionInputBlock[]>
) {
  if (pending.some((item) => item.ownerId === identity.ownerId))
    throw new Error('An attachment submission is already pending');
  let active = true;
  let running = false;
  let controller: AbortController | undefined;
  let resolveUpload!: (blocks: SessionInputBlock[]) => void;
  let rejectUpload!: (error: Error) => void;
  const uploaded = new Promise<SessionInputBlock[]>((resolve, reject) => {
    resolveUpload = resolve;
    rejectUpload = reject;
  });
  const update = (patch: Partial<PendingAttachmentSubmission>) => {
    if (!active) return;
    entry = { ...entry, ...patch };
    pending = pending.map((item) => (item.sessionId === identity.sessionId ? entry : item));
    notify();
  };
  const remove = () => {
    if (!active) return;
    active = false;
    pending = pending.filter((item) => item.sessionId !== identity.sessionId);
    notify();
  };
  const run = async () => {
    if (!active || running || entry.phase === 'submitting' || entry.phase === 'submit-failed')
      return;
    running = true;
    controller = new AbortController();
    update({ phase: 'uploading', progress: undefined });
    try {
      const blocks = await upload(controller.signal, (progress) => update({ progress }));
      if (!active) return;
      update({ phase: 'submitting' });
      resolveUpload(blocks);
    } catch {
      if (active) update({ phase: 'upload-failed' });
    } finally {
      running = false;
    }
  };
  let entry: PendingAttachmentSubmission = {
    ...identity,
    phase: 'uploading',
    retry: () => {
      void run();
    },
    cancel: () => {
      if (!active || entry.phase === 'submitting') return;
      controller?.abort();
      remove();
      rejectUpload(new Error('Attachment submission cancelled'));
      identity.onReturnToEdit?.();
    },
  };
  pending = [...pending, entry];
  notify();
  void run();
  return {
    uploaded,
    cancel: entry.cancel,
    complete: remove,
    fail: () => update({ phase: 'submit-failed' }),
    isActive: () => active,
  };
}
