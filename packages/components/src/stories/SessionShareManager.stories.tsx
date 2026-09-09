import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SessionShareManager } from '@/components/sharing/session-share-manager';
import { SessionShareDialogFrame } from '@/components/sharing/session-share-dialog';

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
    { ...entry, shareId: 'other-share', rootSessionId: 'next', sessionIds: ['next', 'main'] },
  ],
  candidates: candidates.map((candidate) => ({
    ...candidate,
    available: candidate.sessionId !== 'local',
    validUntil: now + 60_000,
  })),
};

const meta = {
  title: 'Sharing/SessionShareManager',
  component: SessionShareManager,
  parameters: { layout: 'fullscreen' },
  render: function ShareManagerStory(args) {
    const [selected, setSelected] = useState(args.selected);
    return (
      <SessionShareDialogFrame title="Designing conversation sharing">
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
    onSelect: () => {},
    onReload: () => {},
    onCreate: () => {},
    onSave: () => {},
    onReset: () => {},
    onCopy: () => {},
    onRevoke: () => {},
  },
} satisfies Meta<typeof SessionShareManager>;
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
