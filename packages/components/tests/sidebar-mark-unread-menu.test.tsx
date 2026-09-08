// @vitest-environment jsdom

import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalProjectMeta, MachineId, SessionId, SessionMeta } from '@lody/shared';

import { LocalProjectItem } from '../src/components/loro-app-sidebar';
import { LoroSidebar } from '../src/components/loro-sidebar';
import { SessionList } from '../src/components/session-list';
import { SidebarUpdatedSessionList } from '../src/components/sidebar-updated-session-list';
import { initI18n } from '../src/i18n';
import { TooltipProvider } from '../src/ui/tooltip';
import { jotaiStore } from '../src/lib/utils';
import { currentWorkspaceSlugAtom } from '../src/atoms/workspace-context';

describe('desktop sidebar mark-unread menus', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;
  const openedWindows: unknown[] = [];
  const navigations: string[] = [];

  beforeEach(async () => {
    await initI18n('en');
    openedWindows.length = 0;
    navigations.length = 0;
    jotaiStore.set(currentWorkspaceSlugAtom, 'synthetic-workspace');
    Object.defineProperty(window, '__LODY_ELECTRON__', { configurable: true, value: true });
    Object.defineProperty(window, 'ipc', {
      configurable: true,
      value: {
        invoke: async (channel: string, target: unknown) => {
          if (channel === 'app.openWindow') openedWindows.push(target);
          return channel === 'app.getFullscreen' ? false : { id: openedWindows.length };
        },
        on: () => () => {},
      },
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      flushSync(() => root?.unmount());
    }
    root = undefined;
    container?.remove();
    container = undefined;
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, '__LODY_ELECTRON__');
    Reflect.deleteProperty(window, 'ipc');
    jotaiStore.set(currentWorkspaceSlugAtom, null);
  });

  function selectMarkUnread(row: Element | null) {
    const moreButton = row?.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
    expect(moreButton).toBeInstanceOf(HTMLButtonElement);
    flushSync(() => {
      moreButton?.click();
    });

    const menuItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.includes('Mark as unread')
    );
    expect(menuItem).toBeInstanceOf(HTMLElement);
    flushSync(() => {
      menuItem?.click();
    });
  }

  function verifyWindowActions(row: Element | null, sessionId: string) {
    expect(row).not.toBeNull();
    flushSync(() => row?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(navigations).toEqual([sessionId]);
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
      flushSync(() => row?.dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifier })));
    }
    expect(navigations).toEqual([sessionId]);
    flushSync(() =>
      row?.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')?.click()
    );
    const menu = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.includes('Open session in new window')
    );
    expect(menu).toBeDefined();
    flushSync(() => menu?.click());
    expect(openedWindows).toEqual(
      Array.from({ length: 3 }, () => ({ workspaceSlug: 'synthetic-workspace', sessionId }))
    );
    expect(navigations).toEqual([sessionId]);
  }

  it('opens the selected workspace separately without also switching the current window', () => {
    const selected: Array<[string, boolean | undefined]> = [];
    flushSync(() => {
      root?.render(
        <LoroSidebar
          workspaceName="Source workspace"
          userEmail="synthetic@example.test"
          workspaces={[
            { id: 'source', name: 'Source workspace' },
            { id: 'target', name: 'Target workspace' },
          ]}
          currentWorkspaceId="source"
          repoSections={[]}
          chats={[]}
          onWorkspaceSelected={(id, newWindow) => selected.push([id, newWindow])}
        />
      );
    });
    const trigger = container!.querySelector('[data-workspace-switcher-trigger]');
    flushSync(() =>
      trigger?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    );
    const target = Array.from(document.querySelectorAll('[role="menuitemradio"]')).find((item) =>
      item.textContent?.includes('Target workspace')
    );
    expect(target).toBeDefined();
    flushSync(() =>
      target?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
      )
    );
    expect(selected).toEqual([['target', true]]);
    expect(container!.querySelector('[data-workspace-switcher-trigger]')?.textContent).toContain(
      'Source workspace'
    );
  });

  it('marks a Workspace-mode GitHub/Chat row unread from its More menu', () => {
    const onMarkSessionUnread = vi.fn();
    flushSync(() => {
      root?.render(
        <SessionList
          sessions={[
            {
              sessionId: 'workspace-session',
              title: 'Workspace session',
              repoFullName: 'lody/lody',
              branchName: 'feat/mark-unread',
              latestMessageAt: 500,
              addedLines: 0,
              deletedLines: 0,
              isWorking: false,
              hasUnreadMessages: false,
              isOffline: false,
              isWaitingPermission: false,
            },
          ]}
          repos={[{ repoFullName: 'lody/lody', collapsed: false }]}
          onMarkSessionUnread={onMarkSessionUnread}
          onSelectSession={(id) => navigations.push(id)}
        />
      );
    });

    verifyWindowActions(
      container!.querySelector('[data-sidebar-session-id="workspace-session"]'),
      'workspace-session'
    );
    selectMarkUnread(container?.querySelector('[data-sidebar-session-id="workspace-session"]'));
    expect(onMarkSessionUnread).toHaveBeenCalledWith('workspace-session');
  });

  it('hides the action once the row is already unread', () => {
    flushSync(() => {
      root?.render(
        <SessionList
          sessions={[
            {
              sessionId: 'unread-session',
              title: 'Unread session',
              repoFullName: null,
              branchName: '',
              latestMessageAt: 500,
              addedLines: 0,
              deletedLines: 0,
              isWorking: false,
              hasUnreadMessages: true,
              isOffline: false,
              isWaitingPermission: false,
            },
          ]}
          repos={[]}
          onArchiveSession={() => undefined}
          onMarkSessionUnread={() => undefined}
        />
      );
    });

    const row = container?.querySelector('[data-sidebar-session-id="unread-session"]');
    const moreButton = row?.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
    expect(moreButton).toBeInstanceOf(HTMLButtonElement);
    flushSync(() => {
      moreButton?.click();
    });
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).some((item) =>
        item.textContent?.includes('Mark as unread')
      )
    ).toBe(false);
  });

  it('marks an Updated/Pinned row unread from its More menu', () => {
    const onMarkItemUnread = vi.fn();
    flushSync(() => {
      root?.render(
        <SidebarUpdatedSessionList
          items={[
            {
              id: 'updated-session',
              kind: 'chat',
              title: 'Updated session',
              sectionLabel: 'Chats',
              latestMessageAt: 500,
              hasUnreadMessages: false,
            },
          ]}
          now={new Date(1_000)}
          onMarkItemUnread={onMarkItemUnread}
          onSelectItem={(id) => navigations.push(id)}
        />
      );
    });

    verifyWindowActions(
      container!.querySelector('[data-sidebar-updated-id="updated-session"]'),
      'updated-session'
    );
    selectMarkUnread(container?.querySelector('[data-sidebar-updated-id="updated-session"]'));
    expect(onMarkItemUnread).toHaveBeenCalledWith('updated-session');
  });

  it('marks a Local Project row unread from its More menu', () => {
    const machineId = 'machine-1' as MachineId;
    const sessionId = 'local-session' as SessionId;
    const session = {
      id: sessionId,
      machineId,
      createdAt: '2026-09-04T00:00:00.000Z',
      lastMessageAt: 500,
      lastReadAt: 500,
      userId: 'user-1',
      cliType: 'builtin',
      agentType: 'codex',
      title: 'Local session',
    } as SessionMeta;
    const project = {
      id: 'project-1',
      name: 'Lody',
      rootPath: '/workspace/lody',
    } as LocalProjectMeta;
    const onMarkSessionUnread = vi.fn();

    flushSync(() => {
      root?.render(
        <TooltipProvider>
          <LocalProjectItem
            machineId={machineId}
            machineName="This device"
            project={project}
            canRemoveProject={false}
            canNavigateProject
            collapsed={false}
            isSelected={false}
            sessionsForProject={[session]}
            childSessionsByParent={new Map()}
            liveSessionStatuses={new Map()}
            formattedPath={project.rootPath}
            defaultSessionTitle="New session"
            selectedSessionId={null}
            removeProjectLabel="Remove folder"
            archiveTooltipLabel="Archive session"
            archiveActionLabel="Archive"
            archiveConfirmLabel="Confirm"
            isMobile={false}
            toggleLabel="Toggle"
            onNavigateProject={() => undefined}
            onNavigateSession={(id) => navigations.push(id)}
            onArchive={() => undefined}
            onMarkSessionUnread={onMarkSessionUnread}
            collapsedOpenedBySessionIds={{}}
            onToggleOpenedBySessions={() => undefined}
            onToggleCollapsed={() => undefined}
            onRequestRemoval={() => undefined}
          />
        </TooltipProvider>
      );
    });

    verifyWindowActions(
      container!.querySelector('[data-sidebar-session-id="local-session"]'),
      'local-session'
    );
    selectMarkUnread(container?.querySelector('[data-sidebar-session-id="local-session"]'));
    expect(onMarkSessionUnread).toHaveBeenCalledWith('local-session');
  });
});
