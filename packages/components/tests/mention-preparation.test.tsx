// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Mention, MentionInput, MentionItem, useMentionContext } from '../src/ui/mention';
import type { MentionPrepare, PreparedMention } from '../src/ui/mention/index';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
let context: ReturnType<typeof useMentionContext>;
function Probe() {
  context = useMentionContext('test');
  return null;
}
function Harness({ prepare, disabled = false }: { prepare: MentionPrepare; disabled?: boolean }) {
  const [value, setValue] = useState('Before /review after');
  return (
    <Mention
      editHistory
      defaultOpen
      inputValue={value}
      onInputValueChange={setValue}
      onFilter={(items) => items}
      autoCloseOnEmpty={false}
    >
      <Probe />
      <MentionInput value={value} />
      <MentionItem value="entry" label="review" disabled={disabled} onMentionPrepare={prepare}>
        Review
      </MentionItem>
    </Mention>
  );
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0);
    return 0;
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function select() {
  const input = container.querySelector('textarea')!;
  input.setSelectionRange(14, 14);
  return context.onMentionAdd('entry', 7);
}
it('preserves the query until a full payload is ready, then commits text and opaque data', async () => {
  const ready = deferred<PreparedMention | null>();
  act(() => root.render(<Harness prepare={() => ready.promise} />));
  let commit: unknown;
  act(() => {
    commit = select();
  });
  expect(context.inputValue).toBe('Before /review after');
  expect(context.mentions).toEqual([]);
  const data = { revision: 'r1', values: { name: 'value' } };
  await act(async () => {
    ready.resolve({ value: 'invocation', text: '/review', kind: 'custom', data });
    await commit;
  });
  expect(context.inputValue).toBe('Before /review after');
  expect(context.mentions).toEqual([
    { start: 7, end: 14, value: 'invocation', kind: 'custom', data },
  ]);
});
it('fences edit-away/edit-back even when the loader ignores AbortSignal', async () => {
  const ready = deferred<PreparedMention | null>();
  let signal: AbortSignal | undefined;
  act(() =>
    root.render(
      <Harness
        prepare={(request) => {
          signal = request.signal;
          return ready.promise;
        }}
      />
    )
  );
  let commit: unknown;
  act(() => {
    commit = select();
  });
  act(() => {
    context.onInputValueChange('Before /other after');
  });
  act(() => {
    context.onInputValueChange('Before /review after');
  });
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    ready.resolve({ value: 'late', text: '/review' });
    await commit;
  });
  expect(context.inputValue).toBe('Before /review after');
  expect(context.mentions).toEqual([]);
});
it('cancels on dismissal and draft remount, and allows a failed selection to retry', async () => {
  const ready = deferred<PreparedMention | null>();
  act(() => root.render(<Harness prepare={() => ready.promise} />));
  let commit: unknown;
  act(() => {
    commit = select();
    context.onOpenChange(false);
  });
  await act(async () => {
    ready.resolve({ value: 'late', text: '/review' });
    await commit;
  });
  expect(context.mentions).toEqual([]);
  act(() => root.render(<Harness key="new-draft" prepare={async () => null} />));
  await act(async () => {
    await select();
  });
  expect(context.inputValue).toBe('Before /review after');
  act(() =>
    root.render(
      <Harness key="new-draft" prepare={async () => ({ value: 'retry', text: '/review' })} />
    )
  );
  await act(async () => {
    await select();
  });
  expect(context.mentions[0]?.value).toBe('retry');
});

it('keeps independent same-name payloads through splices and semantic undo/redo', async () => {
  let serial = 0;
  act(() =>
    root.render(
      <Harness
        prepare={async () => ({
          value: `invocation-${++serial}`,
          text: '/review',
          kind: 'prompt_shortcut',
          data: { snapshot: { revision: 'r1' }, values: { name: `person-${serial}` } },
        })}
      />
    )
  );
  await act(async () => {
    await select();
  });
  const first = context.mentions[0]!;
  // A normal external mention moves both text and the existing opaque range.
  act(() =>
    context.onMentionInsert({ at: 0, text: '@file', value: 'file', kind: 'file', suffix: ' ' })
  );
  expect(context.mentions.find((range) => range.value === first.value)?.start).toBe(13);
  const input = container.querySelector('textarea')!;
  act(() => context.onInputValueChange(context.inputValue + ' /review'));
  input.setSelectionRange(input.value.length, input.value.length);
  await act(async () => {
    await context.onMentionAdd('entry', input.value.length - 7);
  });
  const chips = context.mentions.filter((range) => range.kind === 'prompt_shortcut');
  expect(chips.map((range) => range.value)).toEqual(['invocation-1', 'invocation-2']);
  expect(chips.map((range) => range.data)).toEqual([
    { snapshot: { revision: 'r1' }, values: { name: 'person-1' } },
    { snapshot: { revision: 'r1' }, values: { name: 'person-2' } },
  ]);
  const before = { text: context.inputValue, mentions: context.mentions };
  // The same transaction the input uses when deleting an atomic range.
  act(() => {
    context.onMentionsRemove([chips[0]!]);
    context.onInputValueChange(
      before.text.slice(0, chips[0]!.start) + before.text.slice(chips[0]!.end)
    );
  });
  act(() => {
    context.onHistoryRestore(false);
  });
  expect(context.inputValue).toBe(before.text);
  expect(context.mentions).toEqual(before.mentions);
  expect(context.mentions.find((range) => range.value === first.value)?.data).toBe(first.data);
  act(() => {
    context.onHistoryRestore(true);
  });
  expect(context.mentions.some((range) => range.value === first.value)).toBe(false);
});

it('exposes disabled diagnostics to assistive technology and never starts preparation', async () => {
  const prepare = vi.fn(async () => ({ value: 'bad', text: '/review' }));
  act(() => root.render(<Harness prepare={prepare} disabled />));
  const option = container.querySelector('[role="option"]') as HTMLElement;
  expect(option.getAttribute('aria-disabled')).toBe('true');
  act(() => option.click());
  await act(async () => {
    await select();
  });
  expect(prepare).not.toHaveBeenCalled();
  expect(context.inputValue).toBe('Before /review after');
  expect(context.mentions).toEqual([]);
});
