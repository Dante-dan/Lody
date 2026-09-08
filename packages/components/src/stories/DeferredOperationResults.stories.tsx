import type { Meta, StoryObj } from '@storybook/react';
import { DeferredOperationResults } from '@/components/sessions/deferred-operation-results';

const meta = {
  title: 'Sessions/DeferredOperationResults',
  component: DeferredOperationResults,
  args: { count: 5, included: true, onIncludedChange: () => {}, onProcess: () => {} },
} satisfies Meta<typeof DeferredOperationResults>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const Excluded: Story = { args: { included: false } };
export const Busy: Story = { args: { disabled: true } };
export const Empty: Story = { args: { count: 0 } };
