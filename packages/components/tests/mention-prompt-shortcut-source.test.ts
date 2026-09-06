import { describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import type { PromptShortcutIndexEntry } from '@lody/shared/prompt-shortcuts';
import { selectPromptShortcutCandidates } from '../src/components/mentions/mention-prompt-shortcut-source';
import {
  buildCommandCandidates,
  selectMentionMenuViewForTrigger,
  selectMentionViewActivations,
  type MentionCategory,
} from '../src/components/mentions/mention-registry';

const i18n = createInstance();
await i18n.init({ lng: 'en', resources: {}, initImmediate: false });
const context = { workspaceId: 'workspace', userId: 'author', scope: {} };
function entry(overrides: Partial<PromptShortcutIndexEntry> = {}): PromptShortcutIndexEntry {
  return {
    v: 1,
    id: 'private',
    workspaceId: 'workspace',
    ownerUserId: 'author',
    visibility: 'private',
    name: 'Review',
    slug: 'review',
    scope: {},
    revision: 'r1',
    createdAt: 1,
    updatedAt: 1,
    bodyDocId: 'body',
    variableCount: 0,
    dependencySummary: [],
    ...overrides,
  };
}

describe('Shortcut index discovery', () => {
  it('uses only index fields, keeps private/shared/ACP names distinct, and does not activate unrelated sources', () => {
    const entries = [
      entry(),
      entry({ id: 'shared', visibility: 'workspace', ownerUserId: 'teammate' }),
    ];
    const candidates = selectPromptShortcutCandidates({ entries, context }, '', i18n.t);
    const categories: MentionCategory[] = [
      {
        id: 'prompt_shortcut',
        namespace: 'shortcut',
        label: 'Prompt Shortcuts',
        icon: 'prompt_shortcut',
        status: 'ready',
        directTrigger: '/',
        getCandidates: () => candidates,
      },
      {
        id: 'command',
        namespace: 'cmd',
        label: 'Agent Commands',
        icon: 'command',
        status: 'ready',
        directTrigger: '/',
        getCandidates: () =>
          buildCommandCandidates([{ name: 'review', description: 'ACP review' }], ''),
      },
      {
        id: 'file',
        namespace: 'file',
        label: 'Files',
        icon: 'file',
        status: 'loading',
        activation: { sourceKey: 'file', activate: vi.fn() },
        getCandidates: () => {
          throw new Error('must not rank files');
        },
      },
    ];
    const view = selectMentionMenuViewForTrigger(categories, '/', '');
    expect(view?.level).toBe('aggregate');
    if (view?.level !== 'aggregate') throw new Error('Expected grouped slash view');
    expect(view.groups.map((group) => group.category.id)).toEqual(['prompt_shortcut', 'command']);
    const rows = view.groups.flatMap((group) => group.candidates);
    expect(rows.map((row) => row.value)).toEqual([
      'prompt-shortcut:private',
      'prompt-shortcut:shared',
      'acp-command:review',
    ]);
    expect(rows.map((row) => row.insertText)).toEqual(['/review', '/review', '/review']);
    expect(selectMentionViewActivations(view, categories)).toEqual([]);
    expect(candidates.every((row) => !row.disabled)).toBe(true);
  });

  it('exposes unavailable and unknown entries only on exact search, with distinct disabled reasons', () => {
    const mismatch = entry({ scope: { machineId: 'other' } });
    const dependent = entry({ dependencySummary: [{ kind: 'agent_role', agentRoleId: 'role' }] });
    for (const item of [mismatch, dependent]) {
      expect(selectPromptShortcutCandidates({ entries: [item], context }, '', i18n.t)).toEqual([]);
      expect(selectPromptShortcutCandidates({ entries: [item], context }, 'rev', i18n.t)).toEqual(
        []
      );
    }
    expect(
      selectPromptShortcutCandidates({ entries: [mismatch], context }, 'review', i18n.t)[0]
    ).toMatchObject({ disabled: true, disabledReason: 'Requires a different machine.' });
    expect(
      selectPromptShortcutCandidates({ entries: [dependent], context }, 'review', i18n.t)[0]
    ).toMatchObject({ disabled: true, disabledReason: 'Dependencies cannot be verified yet.' });
    expect(
      selectPromptShortcutCandidates(
        {
          entries: [dependent],
          context,
          resolveDependency: () => ({ kind: 'unknown', reason: 'dependencies_loading' }),
        },
        'review',
        i18n.t
      )[0]
    ).toMatchObject({ disabled: true, disabledReason: 'Checking availability…' });
    expect(
      selectPromptShortcutCandidates(
        { entries: [dependent], context, resolveDependency: () => ({ kind: 'available' }) },
        '',
        i18n.t
      )[0]?.disabled
    ).toBe(false);
  });

  it('does not expose foreign private entries or resolve their dependencies, even on exact search', () => {
    const resolveDependency = vi.fn(() => ({ kind: 'available' as const }));
    const entries = [
      entry({
        ownerUserId: 'other',
        dependencySummary: [{ kind: 'agent_role', agentRoleId: 'private-role' }],
      }),
      entry({ workspaceId: 'other' }),
    ];
    expect(
      selectPromptShortcutCandidates({ entries, context, resolveDependency }, 'review', i18n.t)
    ).toEqual([]);
    expect(resolveDependency).not.toHaveBeenCalled();
  });
});
