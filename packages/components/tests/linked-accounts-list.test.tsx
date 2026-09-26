// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkedAccountsSection } from '../src/components/settings/linked-accounts-list';
import { initI18n } from '../src/i18n';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('LinkedAccountsSection', () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(async () => {
    await initI18n('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    document.body.innerHTML = '';
  });

  it('answers each provider row with its state, and connects one after confirming', async () => {
    const onConnect = vi.fn();
    await act(async () => {
      root?.render(
        <LinkedAccountsSection
          accounts={[{ id: 'a', providerId: 'github' }]}
          onConnect={onConnect}
        />
      );
    });

    const labels = Array.from(container?.querySelectorAll('section p') ?? []).map(
      (element) => element.textContent
    );
    expect(labels).toEqual(['Connected accounts', 'GitHub', 'Google', 'Apple', 'Discord']);
    expect(container?.textContent).toContain('GitHubConnected');
    const connectButtons = Array.from(container?.querySelectorAll('button') ?? []);
    expect(connectButtons.map((button) => button.textContent)).toEqual([
      'Connect',
      'Connect',
      'Connect',
    ]);

    // The first Connect button belongs to Google, the first provider not connected.
    await act(async () => connectButtons[0]!.click());
    const confirm = await vi.waitFor(() => {
      const button = Array.from(document.body.querySelectorAll('button')).find(
        (element) => element.textContent === 'Continue'
      );
      expect(button).toBeDefined();
      return button!;
    });
    await act(async () => confirm.click());

    expect(onConnect).toHaveBeenCalledWith('google');
  });

  it('states what is not connected when nothing can be connected here', async () => {
    await act(async () => {
      root?.render(<LinkedAccountsSection accounts={[]} />);
    });

    expect(container?.querySelector('button')).toBeNull();
    expect(container?.textContent).toContain('GitHubNot connected');
  });
});
