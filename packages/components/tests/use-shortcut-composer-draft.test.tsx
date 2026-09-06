// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Mention } from '../src/ui/mention/index';
import type { ShortcutDraftRecord } from '../src/lib/shortcut-composer-draft';
const mocks = vi.hoisted(() => ({
  runtime: { userId: 'user', workspaceId: 'ws' },
  read: vi.fn(),
  write: vi.fn(async () => {}),
  restored: vi.fn(),
}));
vi.mock('../src/providers/prompt-shortcut-provider', () => ({
  usePromptShortcuts: () => ({ runtime: mocks.runtime }),
}));
vi.mock('../src/lib/shortcut-composer-draft', async (original) => ({
  ...(await original<object>()),
  shortcutDraftRepository: { read: mocks.read, write: mocks.write },
}));
import { useShortcutComposerDraft } from '../src/components/mentions/use-shortcut-composer-draft';
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let edit: (text: string) => void;
function Harness() {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const draft = useShortcutComposerDraft({
    enabled: true,
    composerId: 'session',
    text,
    mentions,
    restore: (record) => {
      mocks.restored(record);
      setText(record.text);
      setMentions(record.mentions);
    },
  });
  edit = (next) => {
    draft.markEdited();
    setText(next);
  };
  return <output>{text}</output>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  mocks.runtime = { userId: 'user', workspaceId: 'ws' };
  vi.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});
const record: ShortcutDraftRecord = { v: 1, text: 'Recovered text', mentions: [], invocations: [] };
it('does not overwrite an edited-then-cleared draft with a late restoration', async () => {
  const pending = deferred<ShortcutDraftRecord>();
  mocks.read.mockReturnValue(pending.promise);
  act(() => root.render(<Harness />));
  act(() => edit('new'));
  act(() => edit(''));
  await act(async () => {
    pending.resolve(record);
    await pending.promise;
  });
  expect(mocks.restored).not.toHaveBeenCalled();
  expect(container.textContent).toBe('');
});
it('discards old-account reads after an identity switch', async () => {
  const old = deferred<ShortcutDraftRecord>();
  const next = deferred<ShortcutDraftRecord>();
  mocks.read.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
  act(() => root.render(<Harness />));
  mocks.runtime = { userId: 'other', workspaceId: 'ws' };
  act(() => root.render(<Harness />));
  await act(async () => {
    old.resolve(record);
    await old.promise;
  });
  expect(mocks.restored).not.toHaveBeenCalled();
  await act(async () => {
    next.resolve({ ...record, text: 'New account draft' });
    await next.promise;
  });
  expect(container.textContent).toBe('New account draft');
  expect(mocks.read.mock.calls[1]?.[0]).toMatchObject({
    userId: 'other',
    workspaceId: 'ws',
    composerId: 'session',
  });
});

it('requires a new restoration ticket when returning to a previously ready identity', async () => {
  const first = deferred<ShortcutDraftRecord | null>();
  const other = deferred<ShortcutDraftRecord | null>();
  const returning = deferred<ShortcutDraftRecord | null>();
  mocks.read
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(other.promise)
    .mockReturnValueOnce(returning.promise);
  act(() => root.render(<Harness />));
  await act(async () => {
    first.resolve(null);
    await first.promise;
  });
  mocks.runtime = { userId: 'other', workspaceId: 'ws' };
  act(() => root.render(<Harness />));
  mocks.runtime = { userId: 'user', workspaceId: 'ws' };
  act(() => root.render(<Harness />));
  expect(mocks.write).not.toHaveBeenCalled();
  await act(async () => {
    other.resolve(record);
    await other.promise;
  });
  expect(mocks.restored).not.toHaveBeenCalled();
  await act(async () => {
    returning.resolve(record);
    await returning.promise;
  });
  expect(container.textContent).toBe(record.text);
});
