import { usePromptShortcuts } from '../../providers/prompt-shortcut-provider';
import { shortcutAvailabilityMessage } from './mention-prompt-shortcut-source';
import { shortcutInvocationAvailability } from './shortcut-composer-state';
import type { PromptShortcutScope } from '@lody/shared/prompt-shortcuts';
import { useEffect, useId, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PROMPT_SHORTCUT_LIMITS,
  shortcutByteLength,
  shortcutChipText,
  type ShortcutInvocation,
} from '@lody/shared/prompt-shortcuts';
import { cn } from '@/lib/utils';
import { useMentionContext } from '@/ui/mention';
import type { Mention as MentionRange } from '@/ui/mention/index';
import { Button } from '@/ui/button';
import { AutoGrowTextarea } from '../settings/form-primitives';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  isShortcutMention,
  missingShortcutVariables,
  type ShortcutMention,
} from './shortcut-composer-state';

/**
 * The values one invocation needs, asked for where the invocation is.
 *
 * Reads as the settings variable editor it mirrors: the `!{name}` token on the
 * left, its value beside it, growing from one row. A missing value tints its own
 * token rather than adding an asterisk, so the thing you have to fix is the
 * thing that is marked.
 */
/**
 * Write an invocation's filled values into what its chip reads as.
 *
 * A draft with three identical `/review` chips is not something anyone can
 * check before sending. Applied on close rather than per keystroke: the
 * replacement moves the caret and writes an undo entry. Returns false when the
 * chip already says the right thing, so the caller can restore focus itself.
 */
export function applyShortcutChipLabel(
  context: {
    inputValue: string;
    onMentionReplace: (request: {
      start: number;
      end: number;
      text: string;
      mentions: MentionRange[];
    }) => void;
  },
  chip: ShortcutMention
): boolean {
  const label = shortcutChipText(chip.data);
  if (label === context.inputValue.slice(chip.start, chip.end)) return false;
  context.onMentionReplace({
    start: chip.start,
    end: chip.end,
    text: label,
    mentions: [{ ...chip, start: 0, end: label.length }],
  });
  return true;
}

export function ShortcutParameters({
  invocation,
  mobile,
  onChange,
  onClose,
}: {
  invocation: ShortcutInvocation;
  mobile: boolean;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const missing = missingShortcutVariables(invocation);
  const title = t('promptShortcut.parameters', { name: invocation.snapshot.name });
  const description = t('promptShortcut.parametersHint');
  const done = t('promptShortcut.done');
  const fields = (
    <div className="space-y-1.5" onKeyDown={(event) => event.stopPropagation()}>
      {invocation.snapshot.variables.map(({ name }, index) => {
        const value = invocation.values[name] ?? '';
        const absent = missing.includes(name);
        const tooLarge = shortcutByteLength(value) > PROMPT_SHORTCUT_LIMITS.variableValueBytes;
        return (
          <div key={name} className="flex items-start gap-2">
            {/* Fixed column so the tokens line up; the chip hugs its own text. */}
            <div className="w-24 shrink-0 pt-1.5">
              <label
                htmlFor={`${fieldId}-${name}`}
                className={cn(
                  'inline-block max-w-full truncate rounded-sm px-1 py-0.5 font-mono text-[11px]',
                  absent
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-status-warning/12 text-status-warning'
                )}
                title={`!{${name}}`}
              >
                {`!{${name}}`}
              </label>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <AutoGrowTextarea
                id={`${fieldId}-${name}`}
                value={value}
                autoFocus={name === (missing[0] ?? invocation.snapshot.variables[0]?.name)}
                aria-invalid={absent || tooLarge}
                aria-label={name}
                onChange={(event) => onChange(name, event.target.value)}
                className="py-1.5 text-xs leading-5"
                data-variable-index={index}
              />
              {tooLarge ? (
                <p className="text-[11px] leading-snug text-destructive">
                  {t('promptShortcut.valueTooLarge')}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
  if (mobile)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onClose();
          }}
          side="bottom"
          className="max-h-[75dvh] overflow-y-auto rounded-t-xl"
        >
          <SheetTitle className="mb-0.5 pr-7 text-sm font-semibold">{title}</SheetTitle>
          <SheetDescription className="mb-3 text-xs leading-snug">{description}</SheetDescription>
          {fields}
          <Button type="button" size="sm" className="mt-3 w-full" onClick={onClose}>
            {done}
          </Button>
        </SheetContent>
      </Sheet>
    );
  return (
    <section
      aria-label={title}
      className="mt-1.5 space-y-2 rounded-lg border border-border/60 bg-card/60 p-2.5"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-semibold text-muted-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/90">{description}</p>
        </div>
        {/* Dismissal is the only action here — the values are already saved on
            the invocation as they are typed. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-1 -mt-0.5 h-7 shrink-0 px-2 text-xs"
          onClick={onClose}
        >
          {done}
        </Button>
      </header>
      {fields}
    </section>
  );
}

/** Product-owned bridge: the primitive only sees immutable opaque range payloads. */
export function ShortcutInvocationEditor({
  activeId,
  onActiveIdChange,
  scope = {},
  onAvailabilityChange,
}: {
  activeId: string | null;
  scope?: PromptShortcutScope;
  onAvailabilityChange?: (blocked: boolean) => void;
  onActiveIdChange: (id: string | null) => void;
}) {
  const context = useMentionContext('ShortcutInvocationEditor');
  const { runtime } = usePromptShortcuts();
  const mobile = useIsMobile();
  const { t } = useTranslation();
  const seenIds = useRef(new Set<string>());
  const chips = useMemo(() => context.mentions.filter(isShortcutMention), [context.mentions]);
  const active = chips.find(({ value }) => value === activeId);
  const unavailable = chips
    .map(({ data }) => ({
      name: data.snapshot.name,
      availability: shortcutInvocationAvailability(
        data,
        runtime ? { userId: runtime.userId, workspaceId: runtime.workspaceId, scope } : null
      ),
    }))
    .filter(({ availability }) => availability.kind !== 'available');
  const blocked = unavailable.length > 0;
  useEffect(() => {
    onAvailabilityChange?.(blocked);
  }, [blocked, onAvailabilityChange]);
  useEffect(() => {
    const added = chips.find(
      ({ value, data }) => !seenIds.current.has(value) && data.snapshot.variables.length > 0
    );
    seenIds.current = new Set(chips.map(({ value }) => value));
    if (added) onActiveIdChange(added.value);
  }, [chips, onActiveIdChange]);
  const close = () => {
    onActiveIdChange(null);
    if (active && applyShortcutChipLabel(context, active)) return;
    context.inputRef.current?.focus();
    if (active)
      context.onPendingSelectionChange({
        start: active.end,
        end: active.end,
        expectedValue: context.inputValue,
      });
  };
  return (
    <>
      {unavailable.map(({ name, availability }, index) => (
        <p key={index} role="status" className="mt-2 text-xs text-muted-foreground">
          {name}: {shortcutAvailabilityMessage(availability, t)}
        </p>
      ))}
      {active ? (
        <ShortcutParameters
          key={active.value}
          invocation={active.data}
          mobile={mobile}
          onClose={close}
          onChange={(name, value) =>
            context.onMentionsChange((ranges) =>
              ranges.map((range) =>
                range.value === active.value && isShortcutMention(range)
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
