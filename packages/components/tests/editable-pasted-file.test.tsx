// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { PastedTextDraft } from '../src/lib/pasted-text-draft';
vi.mock('../src/components/mentions/mention-session-source', async (original) => ({
  ...(await original<object>()),
  useSessionMentionItems: () => [],
}));
vi.mock('../src/components/mentions/mention-agent-role-source', async (original) => ({
  ...(await original<object>()),
  useAgentRoleMentionItems: () => [],
}));
import { UserMessageEditor } from '../src/components/ai-gui/user-message-editor';
import { initI18n } from '../src/i18n';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
  vi.restoreAllMocks();
});

it('opens a pasted file for editing, retains its file form below the threshold, and restores its exact text', async () => {
  await initI18n('en');
  let submitted: PastedTextDraft[] = [];
  function Harness() {
    const [value, setValue] = useState('');
    return (
      <UserMessageEditor
        value={value}
        onChange={setValue}
        onCancel={() => {}}
        onSave={(drafts) => {
          submitted = drafts;
        }}
        isSaving={false}
        conversationFontSize={14}
      />
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  await act(async () => root.render(createElement(Harness)));
  const input = container.querySelector('textarea')!;
  const text = '  ' + 'context '.repeat(700) + '\n';
  await act(async () => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  expect(input.value).not.toContain('context');
  const chips = container.querySelectorAll<HTMLElement>('[data-mention-kind="pasted_text"]');
  expect(chips.length).toBeGreaterThan(0);
  for (const chip of chips)
    vi.spyOn(chip, 'getClientRects').mockReturnValue([
      { left: 0, right: 100, top: 0, bottom: 30 },
    ] as unknown as DOMRectList);
  await act(async () => {
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  });
  const editor = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Edit pasted text"]'
  )!;
  expect(editor?.value).toBe(text);
  const edited = '  short edited context\n';
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      editor,
      edited
    );
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.value).toContain('Text file');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
  );
  const send = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Send'
  )!;
  await act(async () => send.click());
  expect(submitted[0]?.text).toBe(edited);
  // Reopen the draft and explicitly convert it back to prose.
  for (const chip of container.querySelectorAll<HTMLElement>('[data-mention-kind="pasted_text"]'))
    vi.spyOn(chip, 'getClientRects').mockReturnValue([
      { left: 0, right: 100, top: 0, bottom: 30 },
    ] as unknown as DOMRectList);
  await act(async () => {
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }));
  });
  const restore = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Convert to message text'
  )!;
  await act(async () => restore.click());
  expect(input.value).toBe(edited);
  expect(container.querySelector('[data-mention-kind="pasted_text"]')).toBeNull();
});
