// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, Provider } from 'jotai';
import { afterEach, expect, it, vi } from 'vitest';
import { createHashHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import type { SessionHistory, SessionId } from '@lody/shared';
import { initI18n } from '../src/i18n';
import { SessionSendRecovery } from '../src/components/chat/session-send-recovery';
import { createSessionSendJournal, type SessionSendRecord } from '../src/lib/session-send-journal';
import { createSessionSendResources } from '../src/lib/session-send-resources';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function unloadBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it.each(['quit', 'reload', 'close'])('releases the beforeunload veto only after %s cleanup completes', async (reason) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await initI18n();
  const records = new Map<string, SessionSendRecord>();
  const resources = createSessionSendResources({ acquire: async () => { throw new Error('unused'); }, releaseRef: () => {} });
  const journal = createSessionSendJournal({
    resources,
    storage: {
      list: async () => [...records.values()],
      insert: async (value) => { const saved = { ...value, sequence: 1 }; records.set(saved.id, saved); return saved; },
      put: async (value) => { records.set(value.id, value); },
      remove: async (id) => { records.delete(id); },
      close: async () => {},
    },
    lock: async (_key, _signal, run) => run(),
    prepare: async () => { throw new Error('upload failed'); },
    commit: async () => {}, deliver: async () => {},
  });
  await journal.accept({
    id: 'turn', sessionId: 'session' as SessionId, accountId: 'account', workspaceId: 'workspace', sourceReplica: 'replica',
    entry: { id: 'turn', role: 'user', items: [], timestamp: 't' } as SessionHistory,
    delivery: { kind: 'dispatch' },
  });
  const drain = deferred<void>();
  const runtime = { accountId: 'account', sendJournal: journal, sendResources: resources, dispose: async () => {
    await drain.promise; await resources.dispose(); await journal.close();
  } };
  const handlers = new Map<string, (payload: unknown) => void>();
  const reply = deferred<{ ready: boolean; pending: boolean }>();
  vi.stubGlobal('ipc', {
    invoke: async (channel: string, payload: { ready: boolean; pending: boolean }) => {
      if (channel === 'app.replySendLifecycle') reply.resolve(payload);
    },
    on: (channel: string, handler: (payload: unknown) => void) => {
      handlers.set(channel, handler); return () => handlers.delete(channel);
    }, send: () => {},
  });
  const rootRoute = createRootRoute({ component: () => <SessionSendRecovery runtime={runtime as never} /> });
  const router = createRouter({ routeTree: rootRoute, history: createHashHistory() });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => { drain.resolve(); await act(async () => root.unmount()); container.remove(); await resources.dispose(); await journal.close(); });
  await act(async () => { root.render(<Provider store={createStore()}><RouterProvider router={router} /></Provider>); });
  await act(async () => router.load());
  expect(unloadBlocked()).toBe(true);
  handlers.get('app.sendLifecycle')!({ requestId: 'commit', phase: 'commit', reason });
  expect(unloadBlocked()).toBe(true);
  await act(async () => { drain.resolve(); await reply.promise; });
  expect(await reply.promise).toMatchObject({ ready: true, pending: true });
  expect(unloadBlocked()).toBe(false);
  expect(records.get('turn')?.stage).toBe('saved');
});
