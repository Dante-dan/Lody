// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { initI18n } from '../src/i18n';
import { RuntimeCapabilitiesField } from '../src/components/settings/runtime-capabilities-field';
it('requires capability-specific consent and retains missing OS prerequisites after installation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await initI18n('en');
  let installed = false;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  const button = (text: string) => { const found = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes(text)); if (!found) throw new Error(`Missing button ${text}`); return found; };
  try {
    await act(async () => root.render(<RuntimeCapabilitiesField onRequest={async request => {
      if (request.action === 'install') installed = true;
      return { success: true, result: { capabilities: [{ id: 'kimi-cu', displayName: 'Computer Use', description: 'Computer interaction', supported: true, state: installed ? 'partial' : 'not_installed', steps: [{ id: 'permissions', state: 'missing' }], install: { running: false } }] } };
    }} />));
    await act(async () => button('Kimi capabilities').click());
    await act(async () => button('Browse and refresh').click());
    expect(button('Install').disabled).toBe(true);
    expect(installed).toBe(false);
    const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]');
    expect(checkbox).not.toBeNull();
    await act(async () => checkbox?.click());
    expect(button('Install').disabled).toBe(false);
    await act(async () => button('Install').click());
    expect(installed).toBe(true);
    expect(container.textContent).toContain('Prerequisites missing');
    expect(container.textContent).toContain('Privacy & Security');
    expect(button('Install').disabled).toBe(true);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
