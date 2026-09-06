// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '../src/ui/dialog';
import { Mention, MentionContent, MentionInput, MentionItem } from '../src/ui/mention';
import type { Mention as MentionRange } from '../src/ui/mention/index';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView'
);
let root: Root;
let container: HTMLDivElement;
let latestRanges: MentionRange[] = [];
let mobile = false;
function Editor() {
  const [text, setText] = useState('');
  return (
    <Mention
      inputValue={text}
      onInputValueChange={setText}
      onMentionsChange={(ranges) => {
        latestRanges = ranges;
      }}
    >
      <MentionInput aria-label="Prompt" value={text} />
      <MentionContent>
        <MentionItem value="file-id" label="known" insertText="@known" kind="file">
          Known file
        </MentionItem>
      </MentionContent>
    </Mention>
  );
}
function Harness({ modal = true }: { modal?: boolean }) {
  return modal ? (
    <Dialog open>
      <DialogContent noAnimation>
        <DialogTitle>Editor</DialogTitle>
        <Editor />
      </DialogContent>
    </Dialog>
  ) : (
    <Editor />
  );
}
beforeEach(() => {
  mobile = false;
  latestRanges = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && query === '(max-width: 639px)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return new DOMRect(
      100,
      this.hasAttribute('data-lody-dialog-content') ? 100 : 400,
      500,
      this.hasAttribute('data-lody-dialog-content') ? 600 : 100
    );
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function openMenu() {
  const input = document.querySelector('textarea')!;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '@');
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input.getAttribute('aria-expanded')).toBe('true');
  return input;
}
it.each([false, true])(
  'keeps the menu in the modal interaction and scroll boundary (mobile=%s)',
  async (isMobile) => {
    mobile = isMobile;
    await act(async () => root.render(<Harness />));
    const input = await openMenu();
    const list = document.querySelector('[role=listbox]')!;
    expect(list.closest('[data-lody-dialog-content]')).toBe(
      document.querySelector('[role=dialog]')
    );
    expect(document.body.style.pointerEvents).toBe('none');
    if (isMobile) expect((list as HTMLElement).style.pointerEvents).toBe('auto');
    await act(async () => (list.querySelector('[role=option]') as HTMLElement).click());
    expect(input.value).toBe('@known ');
    expect(latestRanges).toMatchObject([{ start: 0, end: 6, value: 'file-id', kind: 'file' }]);
  }
);
it('retains the body portal for a normal composer and commits by keyboard', async () => {
  await act(async () => root.render(<Harness modal={false} />));
  const input = await openMenu();
  const list = document.querySelector('[role=listbox]')!;
  expect(container.contains(list)).toBe(false);
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });
  expect(input.value).toBe('@known ');
});
