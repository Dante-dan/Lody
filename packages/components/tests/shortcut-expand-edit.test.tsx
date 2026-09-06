// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createShortcutInvocation, type PromptShortcut } from '@lody/shared/prompt-shortcuts';
import { Mention, MentionInput, useMentionContext } from '../src/ui/mention';
import { shortcutEditReplacement } from '../src/components/mentions/shortcut-expand-edit';
import { compileShortcutPrompt } from '../src/components/mentions/shortcut-prompt-compilation';
import {
  isShortcutMention,
  shortcutDraftMissingVariables,
} from '../src/components/mentions/shortcut-composer-state';
import {
  captureShortcutDraft,
  parseShortcutDraft,
  shortcutDraftMentions,
} from '../src/lib/shortcut-composer-draft';
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const body: PromptShortcut = {
  v: 1,
  id: 'review',
  workspaceId: 'ws',
  ownerUserId: 'user',
  visibility: 'private',
  name: 'Review',
  slug: 'review',
  prompt: '!{topic}\n  !{missing}',
  variables: [{ name: 'topic' }, { name: 'missing' }],
  mentions: [],
  scope: { machineId: 'other-machine' },
  revision: 'r1',
  createdAt: 1,
  updatedAt: 1,
};
const invocation = createShortcutInvocation('invocation', body);
invocation.values.topic = '$literal !{not-a-variable}';
let context: ReturnType<typeof useMentionContext>;
function Probe() {
  context = useMentionContext('test');
  return null;
}
function Harness() {
  const [text, setText] = useState('Before /review after !{ordinary}');
  return (
    <Mention
      editHistory
      inputValue={text}
      onInputValueChange={setText}
      defaultMentions={[
        { start: 7, end: 14, value: invocation.id, data: invocation, kind: 'prompt_shortcut' },
      ]}
    >
      <Probe />
      <MentionInput value={text} />
    </Mention>
  );
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function expand() {
  const chip = context.mentions.find(isShortcutMention)!;
  act(() => context.onMentionReplace(shortcutEditReplacement(chip)));
}
it('expands in place without eligibility locks, and persists only generated missing markers', () => {
  expand();
  expect(context.inputValue).toBe(
    'Before $literal !{not-a-variable}\n  !{missing} after !{ordinary}'
  );
  expect(shortcutDraftMissingVariables(context.mentions)).toEqual(['missing']);
  const record = captureShortcutDraft(context.inputValue, context.mentions)!;
  const restored = parseShortcutDraft(JSON.parse(JSON.stringify(record)), {
    userId: 'user',
    workspaceId: 'ws',
    composerId: 'session',
  })!;
  expect(shortcutDraftMentions(restored)).toEqual(context.mentions);
  expect(() =>
    compileShortcutPrompt({
      text: context.inputValue,
      mentions: context.mentions,
      ordinaryRewrites: [],
      context: null,
    })
  ).toThrow();
});
it('allows native editing inside a marker, releases its gate on replacement, and restores the chip with undo', () => {
  expand();
  const expandedText = context.inputValue;
  const marker = context.mentions.find((range) => range.kind === 'shortcut_unresolved')!;
  const input = container.querySelector('textarea')!;
  input.setSelectionRange(marker.start + 3, marker.start + 3);
  const key = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
  act(() => {
    input.dispatchEvent(key);
  });
  expect(key.defaultPrevented).toBe(false);
  const text = expandedText.slice(0, marker.start) + 'filled' + expandedText.slice(marker.end);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(shortcutDraftMissingVariables(context.mentions)).toEqual([]);
  const literalStart = text.indexOf('$literal');
  const result = compileShortcutPrompt({
    text,
    mentions: context.mentions,
    ordinaryRewrites: [
      { start: literalStart, end: literalStart + 8, replacement: 'MUST NOT PARSE' },
    ],
    context: null,
  });
  expect(result.text).toBe(text);
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    );
  });
  expect(context.inputValue).toBe(expandedText);
  expect(shortcutDraftMissingVariables(context.mentions)).toEqual(['missing']);
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    );
  });
  expect(context.inputValue).toBe('Before /review after !{ordinary}');
  expect(context.mentions.find(isShortcutMention)?.data).toBe(invocation);
});
