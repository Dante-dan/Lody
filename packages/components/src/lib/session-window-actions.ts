import { toast } from 'sonner';
import i18next from 'i18next';
import { currentWorkspaceSlugAtom } from '@/atoms/workspace-context';
import { jotaiStore } from './utils';
import { isElectronRenderer } from './electron';
import { getIpcServices } from './electron-ipc-client';

export function isNewWindowGesture(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isElectronRenderer() && (event.metaKey || event.ctrlKey);
}

export function openSessionWindow(sessionId: string, tabSessionId?: string): void {
  const workspaceSlug = jotaiStore.get(currentWorkspaceSlugAtom);
  const services = getIpcServices();
  if (!workspaceSlug || !services) return;
  const target = { workspaceSlug, sessionId, ...(tabSessionId ? { tabSessionId } : {}) };
  void services.app.openWindow(target).catch(() => {
    toast.error(i18next.t('sessions.contextMenu.openWindowFailed'));
  });
}

export function beginSessionWindowDrag(sessionId: string): ((released: boolean) => void) | null {
  const services = getIpcServices();
  const workspaceSlug = jotaiStore.get(currentWorkspaceSlugAtom);
  if (!isElectronRenderer() || !services || !workspaceSlug) return null;
  const token = services.app.beginSessionDrag({ workspaceSlug, sessionId });
  // Observe rejection immediately, even if the renderer closes before dragend.
  const pending = token.catch(() => null);
  return (released) => {
    void pending
      .then((id) => (id ? services.app.finishSessionDrag(id, released) : undefined))
      .catch(() => {
        toast.error(i18next.t('sessions.contextMenu.openWindowFailed'));
      });
  };
}

export function handleSessionWindowGesture(
  event: { metaKey: boolean; ctrlKey: boolean; preventDefault(): void },
  sessionId: string
): boolean {
  if (!isNewWindowGesture(event)) return false;
  event.preventDefault();
  openSessionWindow(sessionId);
  return true;
}
