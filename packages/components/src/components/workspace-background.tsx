import { useEffect, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { currentWorkspaceSlugAtom } from '@/atoms/workspace-context';
import { workspaceBackgroundOwnerAtom } from '@/lib/desktop-window-context';
import { getIpcServices } from '@/lib/electron-ipc-client';
import { useWorkspaceBadge } from '@/hooks/use-workspace-badge';

export function WorkspaceWindowRegistration() {
  const slug = useAtomValue(currentWorkspaceSlugAtom);
  useEffect(() => {
    void getIpcServices()?.app.updateWindowWorkspace(slug);
    return () => {
      void getIpcServices()?.app.updateWindowWorkspace(null);
    };
  }, [slug]);
  return null;
}

export function WorkspaceBackground({ children }: { children: ReactNode }) {
  const owner = useAtomValue(workspaceBackgroundOwnerAtom);
  return owner ? children : null;
}

export function WorkspaceBadge() {
  useWorkspaceBadge();
  return null;
}
