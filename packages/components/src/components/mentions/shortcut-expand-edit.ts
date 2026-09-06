import { expandShortcut } from '@lody/shared/prompt-shortcuts';
import type { Mention } from '@/ui/mention/index';
import { isShortcutMention, type ShortcutMention } from './shortcut-composer-state';
import {
  shortcutSemanticSpan,
  expandedShortcutTarget,
  SHORTCUT_TARGET_PREFIX,
} from './shortcut-semantic-mention';

export function isShortcutDraftRange(mention: Mention): boolean {
  return (
    isShortcutMention(mention) ||
    mention.kind === 'shortcut_unresolved' ||
    mention.kind === 'shortcut_literal' ||
    expandedShortcutTarget(mention) !== null
  );
}
export function shortcutEditReplacement(chip: ShortcutMention) {
  // No eligibility check: this is now local editable content, with no hidden scope lock.
  const expanded = expandShortcut(chip.data, true);
  const semantic: Mention[] = expanded.mentions.map((mention) => ({
    start: mention.start,
    end: mention.end,
    kind: shortcutSemanticSpan(mention).kind,
    value: SHORTCUT_TARGET_PREFIX + JSON.stringify(mention.target),
  }));
  const unresolved: Mention[] = expanded.unresolved.map((range) => ({
    start: range.start,
    end: range.end,
    value: range.name,
    kind: 'shortcut_unresolved',
    atomic: false,
  }));
  const explicit = [...semantic, ...unresolved].sort((a, b) => a.start - b.start);
  const mentions: Mention[] = [];
  let end = 0;
  // Plain template text and substituted values are literal until the user edits
  // them. These non-blocking annotations prevent automatic skill/token hydration.
  for (const range of explicit) {
    if (range.start > end)
      mentions.push({
        start: end,
        end: range.start,
        kind: 'shortcut_literal',
        value: 'literal',
        atomic: false,
        highlight: false,
      });
    mentions.push(range);
    end = range.end;
  }
  if (end < expanded.text.length)
    mentions.push({
      start: end,
      end: expanded.text.length,
      kind: 'shortcut_literal',
      value: 'literal',
      atomic: false,
      highlight: false,
    });
  return { start: chip.start, end: chip.end, text: expanded.text, mentions };
}
