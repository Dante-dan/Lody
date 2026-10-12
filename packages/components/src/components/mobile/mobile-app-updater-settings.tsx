import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppUpdaterAction, AppUpdaterPort } from '@lody/platform';
import { useStoreValue } from '@lody/platform/react';
import { Button } from '@lody/ui/button';
import { CompactRow } from '../settings/compact-layout';
import { MobileSettingsRow } from './mobile-settings-row';

/** The port is the capability. No host probing, automatic checks or polling. */
export function MobileAppUpdaterSettings({
  port,
  installedVersion,
  layout = 'mobile',
  buildDetails,
}: {
  port?: AppUpdaterPort;
  installedVersion?: string | null;
  layout?: 'mobile' | 'desktop';
  buildDetails?: ReactNode;
}) {
  if (!port) return null;
  return (
    <HostUpdaterSettings
      port={port}
      installedVersion={installedVersion}
      layout={layout}
      buildDetails={buildDetails}
    />
  );
}

function HostUpdaterSettings({
  port,
  installedVersion,
  layout,
  buildDetails,
}: {
  port: AppUpdaterPort;
  installedVersion?: string | null;
  layout: 'mobile' | 'desktop';
  buildDetails?: ReactNode;
}) {
  const { t } = useTranslation();
  const state = useStoreValue(port.state);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const retry = useRef<'check' | AppUpdaterAction>('check');
  const busy =
    pending || (!failed && (state.phase === 'checking' || state.phase === 'downloading'));

  async function run(operation: 'check' | AppUpdaterAction) {
    if (running.current) return;
    running.current = true;
    retry.current = operation;
    setPending(true);
    setFailed(false);
    try {
      if (operation === 'check') await port.checkForUpdates();
      else await port.performAction(operation);
    } catch {
      // Never render host errors: they may contain private URLs or file paths.
      setFailed(true);
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  const status =
    failed || state.phase === 'error'
      ? t('settings.about.updateError')
      : state.phase === 'checking'
        ? t('settings.about.hostUpdater.checking')
        : state.phase === 'up_to_date'
          ? t('settings.about.upToDate')
          : state.phase === 'available'
            ? t('settings.about.hostUpdater.available', { version: state.availableVersion ?? '' })
            : state.phase === 'downloading'
              ? state.percent != null && Number.isFinite(state.percent)
                ? t('settings.about.downloading', {
                    percent: Math.round(Math.max(0, Math.min(100, state.percent))),
                  })
                : t('settings.about.hostUpdater.downloading')
              : state.phase === 'downloaded'
                ? t('settings.about.hostUpdater.downloaded')
                : undefined;
  const actionLabel =
    failed || state.phase === 'error' || state.action === 'retry'
      ? t('common.retry')
      : state.action === 'download'
        ? t('settings.about.hostUpdater.download')
        : state.action === 'install'
          ? t('settings.about.hostUpdater.install')
          : state.action === 'open'
            ? t('settings.about.hostUpdater.open')
            : t('settings.about.checkForUpdates');

  const Row = layout === 'desktop' ? CompactRow : MobileSettingsRow;
  const version = state.currentVersion ?? installedVersion;
  const label =
    layout === 'desktop'
      ? version
        ? t('settings.about.versionLine', 'Lody {{version}}', { version })
        : 'Lody'
      : t('settings.about.version');

  return (
    <Row
      label={label}
      helper={
        <>
          {buildDetails}
          <span role={failed || state.phase === 'error' ? 'alert' : 'status'}>{status}</span>
        </>
      }
    >
      {layout === 'mobile' ? <span>{version}</span> : null}
      <Button
        variant="secondary"
        size="small"
        disabled={busy}
        onClick={() => {
          void run(
            failed
              ? state.phase === 'error' && state.action
                ? state.action
                : retry.current
              : (state.action ?? 'check')
          );
        }}
      >
        {actionLabel}
      </Button>
    </Row>
  );
}
