// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The prompt's minimum rows are room reserved for WRITING. A Shortcut parameter
 * tray renders inside the same box, under the prompt, so reserving those rows
 * above it leaves a band of empty box between the `/command` and the fields
 * that belong to it.
 */
let reportTrayOpen: ((open: boolean) => void) | undefined;
vi.mock('../src/components/mentions/combined-mention-textarea', () => ({
  CombinedMentionTextarea: (
    props: ComponentProps<'textarea'> & {
      onShortcutParametersOpenChange?: (open: boolean) => void;
      onValueChange?: (value: string) => void;
    }
  ) => {
    reportTrayOpen = props.onShortcutParametersOpenChange;
    return <textarea data-testid="prompt" rows={props.rows} readOnly value="" />;
  },
}));

import { ChatComposer } from '../src/components/chat/chat-composer';
import { initI18n } from '../src/i18n';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatComposer prompt rows beside a Shortcut parameter tray', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    await initI18n('en');
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    reportTrayOpen = undefined;
    vi.unstubAllGlobals();
  });

  it('stops reserving blank writing rows while the tray is open, and restores them after', async () => {
    await act(async () =>
      root.render(
        <ChatComposer
          variant="landing"
          promptValue=""
          onPromptChange={() => undefined}
          promptRows={3}
          primaryAction={null}
        />
      )
    );
    const rows = () => container.querySelector<HTMLTextAreaElement>('[data-testid="prompt"]')!.rows;
    expect(rows()).toBe(3);

    await act(async () => reportTrayOpen?.(true));
    expect(rows()).toBe(1);

    await act(async () => reportTrayOpen?.(false));
    expect(rows()).toBe(3);
  });
});
