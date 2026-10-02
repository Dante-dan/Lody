import type { Meta, StoryObj } from '@storybook/react';
import { EngineTurnOriginLabel } from '../components/ai-gui/engine-turn-origin-label';

const meta = {
  title: 'AI GUI/EngineTurnOriginLabel',
  component: EngineTurnOriginLabel,
} satisfies Meta<typeof EngineTurnOriginLabel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scheduled: Story = { args: { origin: 'cron_job' } };
export const Background: Story = { args: { origin: 'task' } };
export const Ordinary: Story = { args: {} };
export const Unknown: Story = { args: { origin: 'future' } };
