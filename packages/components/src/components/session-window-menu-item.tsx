import { AppWindow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ContextMenuItem } from '@/ui/context-menu';
import { isElectronRenderer } from '@/lib/electron';
import { openSessionWindow } from '@/lib/session-window-actions';

export function SessionWindowMenuItem({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  if (!isElectronRenderer()) return null;
  return (
    <ContextMenuItem icon={<AppWindow />} onSelect={() => openSessionWindow(sessionId)}>
      {t('sessions.contextMenu.openInNewWindow')}
    </ContextMenuItem>
  );
}
