import type { Meta, StoryObj } from '@storybook/react';
import { AttachmentSubmissionStatus } from '@/components/chat/submission/attachment-submission-status';

const meta = {
  title: 'Chat/AttachmentSubmissionStatus',
  component: AttachmentSubmissionStatus,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[min(640px,calc(100vw-32px))]">
        <Story />
      </div>
    ),
  ],
  args: {
    text: 'Continue using this context. [Text file · 6,000 chars]',
    phase: 'uploading',
    progress: {
      phase: 'uploading',
      percent: 42,
      loadedBytes: 4200,
      totalBytes: 10000,
      fileName: 'pasted-context.txt',
      index: 0,
      count: 2,
    },
    onRetry: () => {},
    onEdit: () => {},
  },
} satisfies Meta<typeof AttachmentSubmissionStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Uploading: Story = {};
export const Failed: Story = { args: { phase: 'upload-failed' } };
export const Submitting: Story = { args: { phase: 'submitting' } };
export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
};
