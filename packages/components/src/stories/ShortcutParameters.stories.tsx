import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { createShortcutInvocation, type PromptShortcut } from '@lody/shared/prompt-shortcuts';
import { ShortcutParameters } from '@/components/mentions/shortcut-parameters';
const body: PromptShortcut = {
  v: 1,
  id: 'review',
  workspaceId: 'ws',
  ownerUserId: 'author',
  visibility: 'private',
  name: 'Review',
  slug: 'review',
  prompt: 'Review !{topic}\nFocus: !{focus}',
  variables: [{ name: 'topic' }, { name: 'focus', defaultValue: 'Correctness\nMissing tests' }],
  mentions: [],
  scope: {},
  revision: 'r1',
  createdAt: 1,
  updatedAt: 1,
};
function Harness({ mobile = false, filled = false }: { mobile?: boolean; filled?: boolean }) {
  const [invocation, setInvocation] = useState(() => ({
    ...createShortcutInvocation('invocation', body),
    values: { topic: filled ? 'This change' : '', focus: 'Correctness\nMissing tests' },
  }));
  const [open, setOpen] = useState(true);
  return (
    <div className="w-[min(500px,95vw)]">
      {open ? (
        <ShortcutParameters
          invocation={invocation}
          mobile={mobile}
          onClose={() => setOpen(false)}
          onChange={(name, value) =>
            setInvocation((previous) => ({
              ...previous,
              values: { ...previous.values, [name]: value },
            }))
          }
        />
      ) : null}
    </div>
  );
}
const meta = {
  title: 'Chat/Shortcut Parameters',
  component: Harness,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MissingVariables: Story = {};
export const Filled: Story = { args: { filled: true } };
export const MobileSheet: Story = {
  args: { mobile: true },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
