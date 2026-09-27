// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createStore, Provider } from 'jotai';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createHashHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function unloadBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it.each(['quit', 'reload', 'close'])(
  'releases the beforeunload veto only after %s cleanup completes',
  async (reason) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    await initI18n();
    const records = new Map<string, SessionSendRecord>();
    const resources = createSessionSendResources({
      acquire: async () => {
        throw new Error('unused');
      },
      releaseRef: () => {},
    });
    const journal = createSessionSendJournal({
      resources,
      storage: {
        list: async () => [...records.values()],
        insert: async (value) => {
          const saved = { ...value, sequence: 1 };
          records.set(saved.id, saved);
          return saved;
        },
        put: async (value) => {
          records.set(value.id, value);
        },
        remove: async (id) => {
          records.delete(id);
        },
        close: async () => {},
      },
      lock: async (_key, _signal, run) => run(),
      prepare: async () => {
        throw new Error('upload failed');
      },
      commit: async () => {},
      deliver: async () => {},
    });
    await journal.accept({
      id: 'turn',
      sessionId: 'session' as SessionId,
      accountId: 'account',
      workspaceId: 'workspace',
      sourceReplica: 'replica',
      entry: { id: 'turn', role: 'user', items: [], timestamp: 't' } as SessionHistory,
      delivery: { kind: 'dispatch' },
    });
    const drain = deferred<void>();
    const runtime = {
      accountId: 'account',
      sendJournal: journal,
      sendResources: resources,
      dispose: async () => {
        await drain.promise;
        await resources.dispose();
        await journal.close();
      },
    };
    const handlers = new Map<string, (payload: unknown) => void>();
    const reply = deferred<{ ready: boolean; pending: boolean }>();
    vi.stubGlobal('ipc', {
      invoke: async (channel: string, payload: { ready: boolean; pending: boolean }) => {
        if (channel === 'app.replySendLifecycle') reply.resolve(payload);
      },
      on: (channel: string, handler: (payload: unknown) => void) => {
        handlers.set(channel, handler);
        return () => handlers.delete(channel);
      },
      send: () => {},
    });
    const rootRoute = createRootRoute({
      component: () => <SessionSendRecovery runtime={runtime as never} />,
    });
    const router = createRouter({ routeTree: rootRoute, history: createHashHistory() });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    cleanups.push(async () => {
      drain.resolve();
      await act(async () => root.unmount());
      container.remove();
      await resources.dispose();
      await journal.close();
    });
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <RouterProvider router={router} />
        </Provider>
      );
    });
    await act(async () => router.load());
    expect(unloadBlocked()).toBe(true);
    handlers.get('app.sendLifecycle')!({ requestId: 'commit', phase: 'commit', reason });
    expect(unloadBlocked()).toBe(true);
    await act(async () => {
      drain.resolve();
      await reply.promise;
    });
    expect(await reply.promise).toMatchObject({ ready: true, pending: true });
    expect(unloadBlocked()).toBe(false);
    expect(records.get('turn')?.stage).toBe('saved');
  }
);

it.each(['quit', 'reload', 'close'])(
  'keeps the runtime and unsaved editor alive during %s preflight and commit',
  async (reason) => {
    const { useCodeCollabSaveText } = await import('../src/hooks/use-code-collab-save-text');
    const { hasUnsavedRendererChanges } = await import('../src/lib/renderer-unload-guards');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    await initI18n();
    let live = true;
    let disk = 'original';
    let saveFails = false;
    let editor!: ReturnType<typeof useCodeCollabSaveText>;
    const provider = {
      saveText: async (_id: string, text: string) => {
        if (saveFails) throw new Error('disk unavailable');
        disk = text;
        return {
          status: 'ready',
          entry: {
            fileId: 'file',
            path: 'file.txt',
            kind: 'text',
            sourceState: 'live-collaborative',
          },
          snapshot: { kind: 'text', text },
        };
      },
    };
    function Editor() {
      const value = useCodeCollabSaveText({
        provider: provider as never,
        fileId: 'file',
        enabled: true,
      });
      useEffect(() => {
        editor = value;
      }, [value]);
      return null;
    }
    const handlers = new Map<string, (payload: unknown) => void>();
    type Reply = { ready: boolean; pending: boolean; unsaved?: boolean };
    let reply = deferred<Reply>();
    vi.stubGlobal('ipc', {
      invoke: async (channel: string, value: Reply) => {
        if (channel === 'app.replySendLifecycle') reply.resolve(value);
      },
      on: (channel: string, handler: (payload: unknown) => void) => {
        handlers.set(channel, handler);
        return () => handlers.delete(channel);
      },
      send: () => {},
    });
    const runtime = {
      sendResources: { getActiveCount: () => 0 },
      dispose: async () => {
        live = false;
      },
    };
    const rootRoute = createRootRoute({
      component: () => (
        <>
          <SessionSendRecovery runtime={runtime as never} />
          <Editor />
        </>
      ),
    });
    const router = createRouter({ routeTree: rootRoute, history: createHashHistory() });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    cleanups.push(async () => {
      await act(async () => root.unmount());
      container.remove();
      expect(hasUnsavedRendererChanges()).toBe(false);
    });
    await act(async () => {
      root.render(
        <Provider store={createStore()}>
          <RouterProvider router={router} />
        </Provider>
      );
    });
    await act(async () => router.load());
    const request = async (phase: 'check' | 'commit') => {
      reply = deferred<Reply>();
      await act(async () => {
        handlers.get('app.sendLifecycle')!({ requestId: phase, phase, reason });
        await reply.promise;
      });
      return reply.promise;
    };
    // No pending send. The independent editor guard alone must block disposal.
    await act(async () => editor.onContentChange('unsaved'));
    expect(await request('check')).toMatchObject({ ready: false, pending: false, unsaved: true });
    expect(await request('commit')).toMatchObject({ ready: false, unsaved: true });
    expect(live).toBe(true);
    expect(disk).toBe('original');
    expect(unloadBlocked()).toBe(true);
    // Save failures and conflict-pending remain protected by the same predicate.
    saveFails = true;
    await act(async () => editor.flush());
    expect(editor.status.kind).toBe('error');
    expect(await request('check')).toMatchObject({ ready: false, unsaved: true });
    await act(async () => editor.markConflictPending('changed on disk'));
    expect(await request('commit')).toMatchObject({ ready: false, unsaved: true });
    expect(live).toBe(true);
    // Once saved, this guard releases normally; send cleanup can proceed.
    saveFails = false;
    await act(async () => {
      editor.onContentChange('saved edit');
      await editor.flush();
    });
    expect(disk).toBe('saved edit');
    expect(unloadBlocked()).toBe(false);
    expect(await request('check')).toMatchObject({ ready: true, pending: false });
    // An edit during the native confirmation is rechecked at commit.
    await act(async () => editor.onContentChange('newer edit'));
    expect(await request('commit')).toMatchObject({ ready: false, unsaved: true });
    expect(live).toBe(true);
    await act(async () => editor.flush());
    expect(await request('commit')).toMatchObject({ ready: true });
    expect(live).toBe(false);
    expect(disk).toBe('newer edit');
  }
);
