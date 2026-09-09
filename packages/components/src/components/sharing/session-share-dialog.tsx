import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { SessionMeta, WorkspaceId } from '@lody/shared';
import { userAtom } from '@/atoms';
import { sessionMetaCacheAtom } from '@/atoms/doc-meta';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { getSessionShareCandidates } from '@/lib/session-share-candidates';
import { useSessionShareManagement } from '@/hooks/use-session-share-management';
import { SessionShareManager } from './session-share-manager';
import { useKeyboardAwareScrollIntoView } from '@/hooks/use-keyboard-aware-scroll-into-view';

/** Shared with stories; portal dialogs must account for the iOS overlay keyboard. */
export function SessionShareDialogFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const content = useRef<HTMLDivElement>(null);
  useKeyboardAwareScrollIntoView(content);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        ref={content}
        className="max-w-lg overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          top: 'calc((100dvh - var(--native-keyboard-height, 0px) + var(--safe-area-top, 0px) - max(0px, var(--safe-area-bottom, 0px) - var(--native-keyboard-height, 0px))) / 2)',
          maxHeight:
            'calc(100dvh - var(--native-keyboard-height, 0px) - 2rem - var(--safe-area-top, 0px) - max(0px, var(--safe-area-bottom, 0px) - var(--native-keyboard-height, 0px)))',
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('sharing.manager.title', 'Share conversation')}</DialogTitle>
          <DialogDescription className="break-words">{title}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ShareEditor({ workspaceId, session }: { workspaceId: WorkspaceId; session: SessionMeta }) {
  const { t } = useTranslation();
  const meta = useAtomValue(sessionMetaCacheAtom);
  const [search, setSearch] = useState('');
  const related = useMemo(
    () => getSessionShareCandidates(session.id, Object.values(meta)),
    [meta, session.id]
  );
  const matching = useMemo(
    () =>
      related.filter(
        (entry) =>
          !search || (entry.title ?? '').toLocaleLowerCase().includes(search.toLocaleLowerCase())
      ),
    [related, search]
  );
  const candidates = useMemo(
    () =>
      [session, ...matching.slice(0, 96)].map((entry) => ({
        sessionId: entry.id,
        title: (entry.title ?? '') || t('sessions.untitled', 'Untitled session'),
      })),
    [matching, session, t]
  );
  const management = useSessionShareManagement(
    workspaceId,
    session.id,
    candidates.map((entry) => entry.sessionId)
  );
  return (
    <>
      {related.length > 0 && (
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('sharing.manager.search', 'Find related conversations')}
          placeholder={t('sharing.manager.search', 'Find related conversations')}
        />
      )}
      {matching.length > 96 && (
        <p className="text-xs text-muted-foreground">
          {t(
            'sharing.manager.moreCandidates',
            'Showing the first 96 matches. Search to find another conversation.'
          )}
        </p>
      )}
      <SessionShareManager sessionId={session.id} candidates={candidates} {...management} />
    </>
  );
}

/** Mounted only while open: closed headers do not query or traverse session metadata. */
export function SessionShareDialog({
  workspaceId,
  session,
  onClose,
}: {
  workspaceId: WorkspaceId;
  session: SessionMeta;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const userId = useAtomValue(userAtom)?.id;
  return (
    <SessionShareDialogFrame
      title={(session.title ?? '') || t('sessions.untitled', 'Untitled session')}
      onClose={onClose}
    >
      {userId !== undefined && (
        <ShareEditor
          key={`${userId}:${workspaceId}:${session.id}`}
          workspaceId={workspaceId}
          session={session}
        />
      )}
    </SessionShareDialogFrame>
  );
}
