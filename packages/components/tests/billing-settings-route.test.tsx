// @vitest-environment jsdom

import { act, createElement, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerState = vi.hoisted(() => ({
  workspaceName: 'acme',
  navigateProps: null as Record<string, unknown> | null,
  billingModuleEvaluated: false,
}));
const originalUserAgent = window.navigator.userAgent;
const originalInnerWidth = window.innerWidth;

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute: () => (options: { component: () => ReactNode }) => ({
    ...options,
    useParams: () => routerState,
  }),
  Navigate: (props: Record<string, unknown>) => {
    routerState.navigateProps = props;
    return createElement('p', null, `redirect:${String(props.to)}`);
  },
}));

vi.mock('../src/components/settings/billing-setting', () => {
  routerState.billingModuleEvaluated = true;
  return { BillingSettingsComponent: () => createElement('p', null, 'billing-settings') };
});

import { BillingSettingsRoute } from '../src/routes/$workspaceName/_auth/settings/billing';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('BillingSettingsRoute', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Reflect.deleteProperty(window, '__LODY_NATIVE__');
    Reflect.deleteProperty(window, 'Capacitor');
    routerState.navigateProps = null;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Reflect.deleteProperty(window, '__LODY_NATIVE__');
    Reflect.deleteProperty(window, 'Capacitor');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('keeps a redirected tab body unloaded until a browser opens it', async () => {
    expect(routerState.billingModuleEvaluated).toBe(false);
    Object.defineProperty(window, 'Capacitor', {
      configurable: true,
      value: { getPlatform: () => 'android' },
    });
    await act(async () => {
      root.render(createElement(Suspense, { fallback: null }, createElement(BillingSettingsRoute)));
      await vi.dynamicImportSettled();
    });
    expect(container.textContent).toBe('redirect:/$workspaceName/settings');
    expect(routerState.billingModuleEvaluated).toBe(false);

    Reflect.deleteProperty(window, 'Capacitor');
    await act(async () => {
      root.render(createElement(Suspense, { fallback: null }, createElement(BillingSettingsRoute)));
      await vi.dynamicImportSettled();
    });
    expect(container.textContent).toBe('billing-settings');
    expect(routerState.billingModuleEvaluated).toBe(true);
  });

  it.each([
    ['iOS Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'],
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130'],
  ])('renders billing settings in mobile %s', async (_browser, userAgent) => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: userAgent,
    });

    await act(async () => {
      root.render(createElement(Suspense, { fallback: null }, createElement(BillingSettingsRoute)));
      await vi.dynamicImportSettled();
    });

    expect(container.textContent).toBe('billing-settings');
    expect(routerState.navigateProps).toBeNull();
  });

  it.each(['ios', 'android'])(
    'redirects direct billing URLs in the native %s app',
    async (platform) => {
      Object.defineProperty(window, 'Capacitor', {
        configurable: true,
        value: { getPlatform: () => platform },
      });

      await act(async () => {
        root.render(
          createElement(Suspense, { fallback: null }, createElement(BillingSettingsRoute))
        );
        await vi.dynamicImportSettled();
      });

      expect(container.textContent).toBe('redirect:/$workspaceName/settings');
      expect(routerState.navigateProps).toEqual({
        to: '/$workspaceName/settings',
        params: { workspaceName: 'acme' },
        search: expect.any(Function),
        replace: true,
      });
    }
  );
});
