// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createShortcutInvocation, type PromptShortcut } from '@lody/shared/prompt-shortcuts';
import { Mention, MentionInput, useMentionContext } from '../src/ui/mention';
import { ShortcutInvocationEditor } from '../src/components/mentions/shortcut-parameters';
import {
  isShortcutMention,
  shortcutDraftMissingVariables,
} from '../src/components/mentions/shortcut-composer-state';
import { initI18n } from '../src/i18n';
vi.mock('../src/providers/prompt-shortcut-provider', () => ({
  usePromptShortcuts: () => ({ runtime: { userId: 'user', workspaceId: 'ws' } }),
}));
vi.mock('../src/hooks/use-mobile', () => ({ useIsMobile: () => false }));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const body: PromptShortcut = {
  v: 1,
  id: 'shortcut',
  workspaceId: 'ws',
  ownerUserId: 'user',
  visibility: 'private',
  name: 'Review',
  slug: 'review',
  prompt: 'Review !{topic}',
  variables: [{ name: 'topic', defaultValue: 'code' }],
  mentions: [],
  scope: {},
  revision: 'r1',
  createdAt: 1,
  updatedAt: 1,
};
let context: ReturnType<typeof useMentionContext>;
function Probe() {
  context = useMentionContext('test');
  return null;
}
function Harness() {
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState('/review /review');
  return (
    <Mention
      inputValue={text}
      onInputValueChange={setText}
      defaultMentions={[
        {
          start: 0,
          end: 7,
          value: 'a',
          kind: 'prompt_shortcut',
          data: createShortcutInvocation('a', body),
        },
        {
          start: 8,
          end: 15,
          value: 'b',
          kind: 'prompt_shortcut',
          data: createShortcutInvocation('b', body),
        },
      ]}
    >
      <Probe />
      <MentionInput value={text} />
      <ShortcutInvocationEditor activeId={active} onActiveIdChange={setActive} />
    </Mention>
  );
}
let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  await initI18n('en');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
function type(value: string) {
  const input = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="topic"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      value
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return input;
}
it('initializes defaults once, keeps values independent and blocks whitespace-only values', () => {
  act(() => root.render(<Harness />));
  expect(shortcutDraftMissingVariables(context.mentions)).toEqual([]);
  type('   ');
  expect(shortcutDraftMissingVariables(context.mentions)).toEqual(['Review: topic']);
  const chips = context.mentions.filter(isShortcutMention);
  expect(chips[0]!.data.values.topic).toBe('   ');
  expect(chips[1]!.data.values.topic).toBe('code');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Review: topic');
  act(() => root.render(<Harness />));
  expect(container.querySelector<HTMLTextAreaElement>('textarea[aria-label="topic"]')?.value).toBe(
    '   '
  );
});
it('retains multiline literal input and returns focus to the chip boundary on close', () => {
  act(() => root.render(<Harness />));
  const field = type('first\n$literal !{not-a-variable}');
  const bubble = vi.fn();
  document.addEventListener('keydown', bubble, { once: true });
  act(() => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  expect(bubble).not.toHaveBeenCalled();
  document.removeEventListener('keydown', bubble);
  expect(context.mentions.filter(isShortcutMention)[0]!.data.values.topic).toBe(
    'first\n$literal !{not-a-variable}'
  );
  act(() =>
    [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Done')!
      .click()
  );
  const input = container.querySelector('textarea')!;
  expect(document.activeElement).toBe(input);
  expect(input.selectionStart).toBe(7);
  expect(shortcutDraftMissingVariables(context.mentions)).toEqual([]);
});
