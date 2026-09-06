import type { MessageTextSpan } from '@lody/shared';
import type { PromptShortcutMention } from '@lody/shared/prompt-shortcuts';
import { formatSkillMentionPrompt } from './mention-skill-source';
import { buildAgentRoleMentionPrompt } from './mention-agent-role-source';

/** Semantic targets, never a scan of the substituted string. */
export function renderShortcutSemanticMention(mention: PromptShortcutMention): string {
  const target = mention.target;
  if (target.kind === 'skill')
    return formatSkillMentionPrompt(mention.label.replace(/^\$/, ''), target.path);
  if (target.kind === 'agent_role')
    return buildAgentRoleMentionPrompt({
      id: target.agentRoleId,
      name: mention.label.replace(/^@/, ''),
    });
  return mention.label;
}
export function shortcutSemanticSpan(mention: PromptShortcutMention): MessageTextSpan {
  const target = mention.target;
  const kind =
    target.kind === 'file'
      ? target.directory
        ? 'dir'
        : 'file'
      : target.kind === 'pull_request'
        ? 'pr'
        : target.kind;
  const value =
    target.kind === 'file' || target.kind === 'skill'
      ? target.path
      : target.kind === 'agent_role'
        ? target.agentRoleId
        : `#${target.number}`;
  return { start: mention.start, end: mention.end, label: mention.label, kind, target: value };
}
