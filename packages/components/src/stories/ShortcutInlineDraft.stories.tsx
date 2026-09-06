import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { createShortcutInvocation, type PromptShortcut } from '@lody/shared/prompt-shortcuts';
import { Mention, MentionInput, useMentionContext } from '@/ui/mention';
import { getComposerMentionChip } from '@/components/mentions/mention-chips';
import { ShortcutParameters } from '@/components/mentions/shortcut-parameters';
import { isShortcutMention } from '@/components/mentions/shortcut-composer-state';
const body: PromptShortcut = {
  v: 1,
  id: 'review',
  workspaceId: 'ws',
  ownerUserId: 'user',
  visibility: 'private',
  name: 'Review',
  slug: 'review',
  prompt: 'Review !{topic}\n  Keep !{focus}',
  variables: [{ name: 'topic' }, { name: 'focus', defaultValue: '$literal !{unchanged}' }],
  mentions: [],
  scope: {},
  revision: 'r1',
  createdAt: 1,
  updatedAt: 1,
};
function Editor({
  activeId,
  onActive,
  mobile,
}: {
  activeId: string | null;
  onActive: (id: string | null) => void;
  mobile: boolean;
}) {
  const context = useMentionContext('story');
  const chip = context.mentions.find(
    (range) => range.value === activeId && isShortcutMention(range)
  );
  return (
    <>
      {chip && isShortcutMention(chip) ? (
        <ShortcutParameters
          invocation={chip.data}
          mobile={mobile}
          onClose={() => {
            onActive(null);
            context.inputRef.current?.focus();
          }}
          onChange={(name, value) =>
            context.onMentionsChange((ranges) =>
              ranges.map((range) =>
                range.value === chip.value && isShortcutMention(range)
                  ? {
                      ...range,
                      data: { ...range.data, values: { ...range.data.values, [name]: value } },
                    }
                  : range
              )
            )
          }
        />
      ) : null}
    </>
  );
}
function Harness({ mobile = false }: { mobile?: boolean }) {
  const [text, setText] = useState('Before /review and /review after');
  const [active, setActive] = useState<string | null>('one');
  const [mentions] = useState(() => [
    {
      start: 7,
      end: 14,
      value: 'one',
      kind: 'prompt_shortcut',
      data: createShortcutInvocation('one', body),
    },
    {
      start: 19,
      end: 26,
      value: 'two',
      kind: 'prompt_shortcut',
      data: {
        ...createShortcutInvocation('two', body),
        values: { topic: 'Second invocation', focus: 'Tests' },
      },
    },
  ]);
  return (
    <div className="w-[min(560px,95vw)] rounded-lg border bg-background p-4 [--mention-chip-surface:hsl(var(--background))]">
      <Mention
        editHistory
        inputValue={text}
        onInputValueChange={setText}
        defaultMentions={mentions}
        getMentionChip={getComposerMentionChip}
        onMentionClick={(range) => setActive(range.value)}
      >
        <MentionInput
          value={text}
          aria-label="Prompt"
          className="w-full resize-none bg-transparent p-2"
        />
        <Editor activeId={active} onActive={setActive} mobile={mobile} />
      </Mention>
    </div>
  );
}
const meta = {
  title: 'Chat/Shortcut Inline Draft',
  component: Harness,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Harness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MultipleChips: Story = {};
export const MobileSheet: Story = {
  args: { mobile: true },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
