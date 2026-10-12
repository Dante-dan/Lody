import type { Meta, StoryObj } from '@storybook/react';
import { createStaticStore, type AppUpdaterState } from '@lody/platform';
import { MobileAppUpdaterSettings } from '@/components/mobile/mobile-app-updater-settings';

function StoryShell({
  phase = 'available',
  action,
  percent = 42,
  layout = 'mobile',
}: Partial<AppUpdaterState> & { layout?: 'mobile' | 'desktop' }) {
  return (
    <MobileAppUpdaterSettings
      layout={layout}
      port={{
        state: createStaticStore({ phase, action, percent, availableVersion: '2.0' }),
        checkForUpdates: async () => {},
        performAction: async () => {},
      }}
    />
  );
}
const meta = { title: 'Mobile/AppUpdaterSettings', component: StoryShell } satisfies Meta<
  typeof StoryShell
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Available: Story = { args: { phase: 'available', action: 'download' } };
export const Checking: Story = { args: { phase: 'checking', action: undefined } };
export const Downloading: Story = { args: { phase: 'downloading', action: undefined } };
export const Downloaded: Story = { args: { phase: 'downloaded', action: 'install' } };
export const Error: Story = { args: { phase: 'error', action: 'retry' } };

export const DesktopAvailable: Story = {
  args: { phase: 'available', action: 'download', layout: 'desktop' },
};
