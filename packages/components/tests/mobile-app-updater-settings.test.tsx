// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createStore as createUpdaterStore,
  type AppUpdaterPort,
  type AppUpdaterState,
} from '@lody/platform';
import { MobileAppUpdaterSettings } from '../src/components/mobile/mobile-app-updater-settings';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../locales/en.json';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    resources: { en: { translation: en } },
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe.each(['mobile', 'desktop'] as const)('host-owned About updates (%s)', (layout) => {
  function button(label: string): HTMLButtonElement {
    const match = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === label
    );
    if (!match) throw new Error(`Missing button: ${label}`);
    return match;
  }

  it('shows no updater on a host without the capability', () => {
    act(() => root.render(<MobileAppUpdaterSettings layout={layout} />));
    expect(container.textContent).not.toContain('Check for Updates');
  });

  it('presents host snapshots and explicit actions without automatically checking', async () => {
    const state = createUpdaterStore<AppUpdaterState>({ phase: 'idle', currentVersion: '1.0' });
    const port: AppUpdaterPort = {
      state,
      checkForUpdates: async () => {
        state.set({ phase: 'available', availableVersion: '2.0', action: 'download' });
      },
      performAction: async (action) => {
        if (action !== 'download') throw new Error('Unexpected action');
        state.set({ phase: 'downloaded', action: 'install' });
      },
    };
    act(() => root.render(<MobileAppUpdaterSettings port={port} layout={layout} />));
    expect(state.get().phase).toBe('idle');
    expect(container.textContent).toContain('1.0');
    await act(async () => button('Check for Updates').click());
    expect(container.textContent).toContain('Update available: 2.0');
    await act(async () => button('Download update').click());
    expect(container.textContent).toContain('Update downloaded');
    expect(button('Install update').disabled).toBe(false);
    act(() => state.set({ phase: 'downloading', percent: 32.8 }));
    expect(container.textContent).toContain('33%');
    expect(button('Check for Updates').disabled).toBe(true);
    act(() => state.set({ phase: 'checking' }));
    expect(container.textContent).toContain('Checking for updates');
    act(() => state.set({ phase: 'up_to_date', currentVersion: '2.0' }));
    expect(container.textContent).toContain('Up to date');
    expect(container.textContent).toContain('2.0');
  });

  it('keeps failures retryable and does not disclose native error details', async () => {
    const state = createUpdaterStore<AppUpdaterState>({ phase: 'idle' });
    let fail = true;
    const port: AppUpdaterPort = {
      state,
      checkForUpdates: async () => {
        state.set({ phase: 'checking' });
        if (fail) throw new Error('/private/synthetic-token');
        state.set({ phase: 'available', action: 'open' });
      },
      performAction: async (action) => {
        if (action !== 'open') throw new Error('Unexpected action');
        state.set({ phase: 'up_to_date' });
      },
    };
    act(() => root.render(<MobileAppUpdaterSettings port={port} layout={layout} />));
    await act(async () => button('Check for Updates').click());
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('synthetic-token');
    expect(button('Retry').disabled).toBe(false);
    fail = false;
    await act(async () => button('Retry').click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => button('Open update page').click());
    expect(state.get().phase).toBe('up_to_date');
  });
});
