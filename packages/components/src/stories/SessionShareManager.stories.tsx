import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  SessionShareManager,
  type SessionShareManagerProps,
} from '@/components/sharing/session-share-manager';
import { SessionShareDialogFrame } from '@/components/sharing/session-share-dialog';
import { Input } from '@/ui/input';

const now = 1_800_000_000_000;
const entry = {
  title: 'Designing conversation sharing',
  shareId: 'story-share',
  rootSessionId: 'main',
  authorUserId: 'author',
  status: 'active' as const,
  scopeVersion: 1,
  credentialVersion: 1,
  sessionIds: ['main', 'child'],
  readableSessionIds: ['main', 'child'],
  validUntil: now + 60_000,
  canManage: true,
  canRevoke: true,
};
const candidates = [
  { sessionId: 'main', title: 'Designing conversation sharing' },
  { sessionId: 'child', title: 'Streaming and attachment behavior' },
  { sessionId: 'next', title: 'Deployment notes' },
  { sessionId: 'local', title: 'Local experiment' },
];
const state = {
  root: entry,
  sources: [
    entry,
    {
      ...entry,
      title: 'Deployment notes',
      shareId: 'other-share',
      rootSessionId: 'next',
      sessionIds: ['next', 'main'],
      readableSessionIds: ['next', 'main'],
    },
  ],
  candidates: candidates.map((candidate) => ({
    ...candidate,
    available: candidate.sessionId !== 'local',
    validUntil: now + 60_000,
  })),
};

/** Mirrors the product dialog's filter so the scope section is laid out for real. */
function CandidateFilter() {
  const [value, setValue] = useState('');
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-8 pl-8 text-sm"
        aria-label="Find related conversations"
        placeholder="Find related conversations"
      />
    </div>
  );
}

const meta = {
  title: 'Sharing/SessionShareManager',
  component: SessionShareManager,
  parameters: { layout: 'fullscreen' },
  render: function ShareManagerStory({ frameTitle, ...args }) {
    const [selected, setSelected] = useState(args.selected);
    return (
      <SessionShareDialogFrame title={frameTitle ?? 'Designing conversation sharing'}>
        <SessionShareManager {...args} selected={selected} onSelect={setSelected} />
      </SessionShareDialogFrame>
    );
  },
  args: {
    sessionId: 'main',
    state,
    candidates,
    selected: ['main', 'child'],
    now,
    copyableShareIds: ['story-share'],
    busy: false,
    conflict: false,
    error: null,
    notice: null,
    filter: <CandidateFilter />,
    filterNote: null,
    onSelect: () => {},
    onReload: () => {},
    onCreate: () => {},
    onSave: () => {},
    onReset: () => {},
    onCopy: () => {},
    onRevoke: () => {},
  },
} satisfies Meta<SessionShareManagerProps & { frameTitle?: string }>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Active: Story = {};
export const NewLink: Story = {
  args: { state: { ...state, root: null, sources: [] }, selected: ['main'] },
};
export const MissingSecret: Story = { args: { copyableShareIds: [] } };
export const Administrator: Story = {
  args: { state: { ...state, root: { ...entry, canManage: false } }, copyableShareIds: [] },
};
export const Conflict: Story = { args: { conflict: true } };
export const SourceUnavailable: Story = {
  args: {
    state: {
      root: null,
      sources: [],
      candidates: state.candidates.map((candidate) => ({
        ...candidate,
        available: false,
        validUntil: null,
      })),
    },
    selected: ['main'],
  },
};
/** A title that cannot fit, plus a truncated candidate list and a result message. */
export const LongTitleAndNotice: Story = {
  args: {
    frameTitle:
      'Reworking the conversation sharing dialog so that long session titles, narrow phones and the on-screen keyboard all stay usable',
    filterNote: 'Showing the first 96 matches. Search to narrow.',
    notice: 'Share link copied.',
    candidates: [
      ...candidates,
      {
        sessionId: 'verbose',
        title:
          'Investigating why attachment previews expire earlier than the surrounding conversation history does',
      },
    ],
  },
};
export const Failure: Story = {
  args: { error: 'Could not update sharing. Check the current settings and try again.' },
};
export const Loading: Story = { args: { state: undefined } };
