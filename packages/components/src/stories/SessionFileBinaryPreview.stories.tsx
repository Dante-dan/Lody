import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { SessionFileBinaryPreview } from '@/components/sessions/session-file-binary-preview';

const meta = {
  title: 'Sessions/SessionFileBinaryPreview',
  component: SessionFileBinaryPreview,
  decorators: [
    (Story) => (
      <div className="h-80 w-96 bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionFileBinaryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const LocalArchive: Story = {
  args: {
    path: '/tmp/build/Lody.zip',
    localHost: {
      openTarget: 'default-app',
      revealLabel: 'Reveal in Finder',
      onOpen: fn(),
      onReveal: fn(),
    },
  },
};

export const RemoteArchive: Story = {
  args: { path: 'build/Lody.zip' },
};
