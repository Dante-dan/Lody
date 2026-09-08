// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider, createStore, useAtomValue, type PrimitiveAtom } from 'jotai';
import { afterEach, expect, it, vi } from 'vitest';
import { MainLayout } from '../src/components/main-layout';
import { activeWorkspaceRuntimeAtom, type WorkspaceRuntime } from '../src/atoms/runtime';
import type { TaskId } from '@lody/shared';
import { tasksFeatureEnabledAtom } from '../src/atoms/settings';
import { sidebarCollapsedAtom } from '../src/atoms/sidebar-state';
import { zenLayoutModeAtom } from '../src/atoms/layout-state';
import { taskIndexRowsAtom, taskIndexReadyAtom, openTaskTabsAtom } from '../src/atoms/tasks';

vi.mock('../src/atoms/runtime', async () => {
  const { atom } = await import('jotai');
  return { activeWorkspaceRuntimeAtom: atom(null) };
});
vi.mock('../src/atoms/settings', async () => {
  const { atom } = await import('jotai');
  return { tasksFeatureEnabledAtom: atom(true) };
});
vi.mock('../src/atoms/sidebar-state', async () => {
  const { atom } = await import('jotai');
  return { sidebarCollapsedAtom: atom(false) };
});
vi.mock('../src/atoms/tasks', async () => {
  const { atom } = await import('jotai');
  const rows = atom({});
  const ready = atom(false);
  const tabs = atom<string[]>([]);
  return {
    taskIndexRowsAtom: rows,
    taskIndexReadyAtom: ready,
    openTaskTabsAtom: tabs,
    clearTaskIndexAtom: atom(null, (_, set) => {
      set(rows, {});
      set(ready, false);
    }),
    clearOpenTaskTabsAtom: atom(null, (_, set) => {
      set(tabs, []);
    }),
  };
});
// Simulate only the task-index wire. MainLayout and useTaskIndexSync are real.
vi.mock('@lody/shared', () => ({
  getTaskIndexFlockDocId: () => 'synthetic-index',
  getTaskIndexScanPrefix: () => 'task:',
  readTaskIndexRows: (rows: unknown) => rows,
  applyTaskIndexRowEvents: (_previous: unknown, events: unknown[]) => events[0],
}));
vi.mock('../src/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('../src/components/web-workspace-layout', () => ({
  WebWorkspaceLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/components/mobile/mobile-workspace-layout', () => ({
  MobileWorkspaceLayout: () => null,
}));
vi.mock('../src/components/workspace-background', () => ({
  WorkspaceWindowRegistration: () => null,
  WorkspaceBadge: () => null,
  WorkspaceBackground: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/components/bug-report/bug-report-dialog-container', () => ({
  BugReportDialogContainer: () => null,
}));
vi.mock('../src/components/settings/join-community-dialog-container', () => ({
  JoinCommunityDialogContainer: () => null,
}));
vi.mock('../src/components/stuck-connection-banner', () => ({
  StuckConnectionBannerContainer: () => null,
}));
vi.mock('../src/components/settings/desktop-settings-modal', () => ({
  DesktopSettingsModal: () => null,
}));
vi.mock('../src/components/tasks/task-quick-add-dialog-container', () => ({
  TaskQuickAddDialogContainer: () => null,
}));
vi.mock('../src/components/tasks/task-status-watcher', () => ({ TaskStatusWatcher: () => null }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
});

function TaskView() {
  const rows = useAtomValue(taskIndexRowsAtom);
  const tabs = useAtomValue(openTaskTabsAtom);
  return <output>{JSON.stringify({ rows, tabs })}</output>;
}

it('keeps the task index, open tabs and updates through collapse/Zen, but releases them when scope is lost', async () => {
  const store = createStore();
  let onBatch: ((batch: { events: unknown[] }) => void) | undefined;
  let row = { 'synthetic-task': { title: 'Before' } };
  const runtime = {
    workspaceId: 'synthetic-workspace',
    repo: {
      openFlockDoc: async () => ({
        flock: {
          scan: () => row,
          subscribe: (listener: typeof onBatch) => {
            onBatch = listener;
            return () => {
              onBatch = undefined;
            };
          },
        },
        joinRoom: async () => ({ unsubscribe() {}, firstSyncedWithRemote: Promise.resolve() }),
      }),
    },
  };
  // These normally derived atoms are writable fixtures in this shell test.
  const activeRuntime = activeWorkspaceRuntimeAtom as PrimitiveAtom<WorkspaceRuntime | null>;
  const tasksEnabled = tasksFeatureEnabledAtom as PrimitiveAtom<boolean>;
  store.set(activeRuntime, runtime as unknown as WorkspaceRuntime);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const render = (workspaceReady = true) =>
    root!.render(
      <Provider store={store}>
        <MainLayout workspaceReady={workspaceReady}>
          <TaskView />
        </MainLayout>
      </Provider>
    );
  await act(async () => render());
  expect(store.get(taskIndexReadyAtom)).toBe(true);
  await act(async () => store.set(openTaskTabsAtom, ['synthetic-task' as TaskId]));

  for (const hiddenAtom of [sidebarCollapsedAtom, zenLayoutModeAtom]) {
    await act(async () => store.set(hiddenAtom, true));
    expect(store.get(taskIndexReadyAtom)).toBe(true);
    expect(container.textContent).toContain('synthetic-task');
    expect(store.get(openTaskTabsAtom)).toEqual(['synthetic-task']);
    row = { 'synthetic-task': { title: 'After hidden update' } };
    await act(async () => onBatch?.({ events: [row] }));
    expect(container.textContent).toContain('After hidden update');
    await act(async () => store.set(hiddenAtom, false));
  }

  await act(async () => render(false));
  expect(store.get(taskIndexRowsAtom)).toEqual({});
  expect(store.get(openTaskTabsAtom)).toEqual([]);
  expect(store.get(taskIndexReadyAtom)).toBe(false);
  expect(onBatch).toBeUndefined();
  await act(async () => {
    store.set(sidebarCollapsedAtom, true);
    render();
  });
  expect(store.get(taskIndexReadyAtom)).toBe(true);
  expect(container.textContent).toContain('After hidden update');
  await act(async () => store.set(tasksEnabled, false));
  expect(store.get(taskIndexReadyAtom)).toBe(false);
  expect(onBatch).toBeUndefined();
});
