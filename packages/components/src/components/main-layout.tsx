import { useEffect, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { tasksFeatureEnabledAtom } from '@/atoms/settings';
import { useIsMobile } from '../hooks/use-mobile';
import { useTaskIndexSync } from '../hooks/use-task-index';
import { MobileWorkspaceLayout } from './mobile/mobile-workspace-layout';
import { WebWorkspaceLayout } from './web-workspace-layout';
import { BugReportDialogContainer } from './bug-report/bug-report-dialog-container';
import { JoinCommunityDialogContainer } from './settings/join-community-dialog-container';
import { StuckConnectionBannerContainer } from './stuck-connection-banner';
import { DesktopSettingsModal } from './settings/desktop-settings-modal';
import { TaskQuickAddDialogContainer } from './tasks/task-quick-add-dialog-container';
import { TaskStatusWatcher } from './tasks/task-status-watcher';
import { currentWorkspaceSlugAtom } from '@/atoms/workspace-context';
import { workspaceBackgroundOwnerAtom } from '@/lib/desktop-window-context';
import { getIpcServices } from '@/lib/electron-ipc-client';
import { useWorkspaceBadge } from '@/hooks/use-workspace-badge';
import { ElectronSessionCompletionNotifier } from './electron-session-completion-notifier';
import { AutoArchivePrWatcher } from './auto-archive-pr-watcher';
export {
  getMobileMainLayoutContentClassName,
  getMobileMainLayoutRootClassName,
} from './workspace-layout-utils';

export function WorkspaceRuntimeShell({
  children,
  workspaceReady = true,
}: {
  children: ReactNode;
  workspaceReady?: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileWorkspaceLayout workspaceReady={workspaceReady}>{children}</MobileWorkspaceLayout>
    );
  }

  return <WebWorkspaceLayout>{children}</WebWorkspaceLayout>;
}

/** Keeps the workspace task index live for the sidebar count and the Tasks page. */
function TaskIndexSync() {
  useTaskIndexSync();
  return null;
}

function WorkspaceBadge() {
  useWorkspaceBadge();
  return null;
}

export function MainLayout({
  children,
  workspaceReady = true,
}: {
  children: ReactNode;
  /**
   * Keeps the navigation shell mounted while a new workspace scope converges,
   * without starting workspace-owned background work or mobile content stacks.
   */
  workspaceReady?: boolean;
}) {
  // Behind the beta gate none of this mounts: no index subscription, no status
  // watcher, no quick-add dialog listening for its open atom.
  const tasksEnabled = useAtomValue(tasksFeatureEnabledAtom);
  const owner = useAtomValue(workspaceBackgroundOwnerAtom);
  const slug = useAtomValue(currentWorkspaceSlugAtom);
  useEffect(() => {
    void getIpcServices()?.app.updateWindowWorkspace(slug);
    return () => {
      void getIpcServices()?.app.updateWindowWorkspace(null);
    };
  }, [slug]);

  return (
    <WorkspaceRuntimeShell workspaceReady={workspaceReady}>
      {owner ? <WorkspaceBadge /> : null}
      {children}
      {tasksEnabled && workspaceReady ? (
        <>
          <TaskIndexSync />
          {owner ? <TaskStatusWatcher /> : null}
          <TaskQuickAddDialogContainer />
        </>
      ) : null}
      {owner && workspaceReady ? (
        <>
          <ElectronSessionCompletionNotifier />
          <AutoArchivePrWatcher />
        </>
      ) : null}
      {workspaceReady ? <BugReportDialogContainer /> : null}
      <JoinCommunityDialogContainer />
      <StuckConnectionBannerContainer />
      {workspaceReady ? <DesktopSettingsModal /> : null}
    </WorkspaceRuntimeShell>
  );
}
