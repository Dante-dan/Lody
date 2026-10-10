import * as stylex from '@stylexjs/stylex';
import { colors } from '@lody/ui/tokens/colors.stylex';
import { space } from '@lody/ui/tokens/scales.stylex';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuntimeCapabilityStatus } from 'acp-extension-core';
import type { RuntimeCapabilitiesRequest, MachineRuntimeCapabilitiesResponse } from '@lody/shared';
import { Button } from '@lody/ui/button';
import { Checkbox } from '@lody/ui/checkbox';
import { CollapsibleSection, FormMessage } from './form-primitives';

const styles = stylex.create({
  row: { paddingBlock: space[3], borderTop: `1px solid ${colors.separator}`, display: 'flex', flexDirection: 'column', gap: space[2] },
  consent: { display: 'flex', alignItems: 'flex-start', gap: space[2] },
});

export function RuntimeCapabilitiesField({ onRequest }: {
  onRequest: (request: RuntimeCapabilitiesRequest) => Promise<MachineRuntimeCapabilitiesResponse>;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<readonly RuntimeCapabilityStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState<string>();
  const execute = async (request: RuntimeCapabilitiesRequest) => {
    setBusy(true); setError(undefined); setConfirmed(undefined);
    try {
      const response = await onRequest(request);
      if (!response.success) { setError(response.error); return; }
      setItems(previous => request.action === 'list' ? response.result.capabilities : previous.map(item => response.result.capabilities.find(next => next.id === item.id) ?? item));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <CollapsibleSection title={t('agents.runtimeCapabilities.title', 'Kimi capabilities')}>
    <Button disabled={busy} onClick={() => void execute({ action: 'list' })}>{t('agents.runtimeCapabilities.refresh', 'Browse and refresh status')}</Button>
    {busy && <FormMessage tone="warning">{t('agents.runtimeCapabilities.working', 'Checking or installing capability…')}</FormMessage>}
    {error && <FormMessage tone="warning">{error}</FormMessage>}
    {items.map(item => <div key={item.id} {...stylex.props(styles.row)}>
      <strong>{item.displayName}</strong>
      <p>{item.description}</p>
      <p>{t(`agents.runtimeCapabilities.states.${item.state}`, item.state)}</p>
      {item.steps.map(step => <p key={step.id}>{step.id}: {t(`agents.runtimeCapabilities.steps.${step.state}`, step.state)}{step.detail ? ` — ${step.detail}` : ''}</p>)}
      {item.steps.some(step => step.id === 'permissions' && step.state !== 'ok') && <FormMessage tone="warning">{t('agents.runtimeCapabilities.permissions', 'Open system Privacy & Security settings and grant Accessibility and Screen Recording access to Kimi CU, then refresh status.')}</FormMessage>}
      {item.steps.some(step => step.id === 'extension' && step.state !== 'ok') && <FormMessage tone="warning">{t('agents.runtimeCapabilities.extension', 'Connect the WebBridge browser extension to the running daemon, then refresh status. Installing the runtime capability alone does not grant browser access.')}</FormMessage>}
      {item.install.error && <FormMessage tone="error">{item.install.error}</FormMessage>}
      {item.install.note && <FormMessage tone="warning">{item.install.note}</FormMessage>}
      {item.supported && item.state !== 'ready' && <>
        <label {...stylex.props(styles.consent)}><Checkbox checked={confirmed === item.id} disabled={busy} onCheckedChange={value => setConfirmed(value === true ? item.id : undefined)} />{t('agents.runtimeCapabilities.consent', 'Allow Kimi to download and install this capability. OS permissions and browser extension setup may require separate action.')}</label>
        <Button disabled={busy || confirmed !== item.id || item.install.running} onClick={() => void execute({ action: 'install', id: item.id, confirmed: true })}>{t('agents.runtimeCapabilities.install', 'Install')}</Button>
      </>}
    </div>)}
  </CollapsibleSection>;
}
