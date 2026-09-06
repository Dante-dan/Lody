import { shortcutEditReplacement } from './shortcut-expand-edit';
import { usePromptShortcuts } from '../../providers/prompt-shortcut-provider';
import { shortcutAvailabilityMessage } from './mention-prompt-shortcut-source';
import { shortcutInvocationAvailability } from './shortcut-composer-state';
import type { PromptShortcutScope } from '@lody/shared/prompt-shortcuts';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PROMPT_SHORTCUT_LIMITS,
  shortcutByteLength,
  type ShortcutInvocation,
} from '@lody/shared/prompt-shortcuts';
import { useMentionContext } from '@/ui/mention';
import { Button } from '@/ui/button';
import { AutoGrowTextarea } from '../settings/form-primitives';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  isShortcutMention,
  missingShortcutVariables,
  shortcutDraftMissingVariables,
} from './shortcut-composer-state';

export function ShortcutParameters({
  invocation,
  mobile,
  onChange,
  onClose,
  onExpand,
}: {
  invocation: ShortcutInvocation;
  mobile: boolean;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
  onExpand?: () => void;
}) {
  const { t } = useTranslation();
  const missing = missingShortcutVariables(invocation);
  const title = t('promptShortcut.parameters', { name: invocation.snapshot.name });
  const description = t('promptShortcut.parametersHint');
  const fields = (
    <div className="space-y-3" onKeyDown={(event) => event.stopPropagation()}>
      {invocation.snapshot.variables.map(({ name }, index) => {
        const value = invocation.values[name] ?? '';
        const tooLarge = shortcutByteLength(value) > PROMPT_SHORTCUT_LIMITS.variableValueBytes;
        return (
          <label key={name} className="block space-y-1 text-sm">
            <span>
              {name}
              {missing.includes(name) ? ' *' : ''}
            </span>
            <AutoGrowTextarea
              value={value}
              autoFocus={name === (missing[0] ?? invocation.snapshot.variables[0]?.name)}
              aria-invalid={missing.includes(name) || tooLarge}
              aria-label={name}
              onChange={(event) => onChange(name, event.target.value)}
              className="min-h-9"
              data-variable-index={index}
            />
            {tooLarge ? (
              <span className="text-destructive">{t('promptShortcut.valueTooLarge')}</span>
            ) : null}
          </label>
        );
      })}
      {onExpand ? (
        <Button type="button" variant="ghost" size="sm" onClick={onExpand}>
          {t('promptShortcut.expandEdit')}
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={onClose}>
        {t('promptShortcut.done')}
      </Button>
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
          <SheetTitle className="mb-1 pr-7 text-base">{title}</SheetTitle>
          <SheetDescription className="mb-4">{description}</SheetDescription>
          {fields}
        </SheetContent>
      </Sheet>
    );
  return (
    <section aria-label={title} className="mt-2 space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
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
  const missing = shortcutDraftMissingVariables(context.mentions);
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
      {missing.length > 0 ? (
        <p role="status" className="mt-2 text-xs text-destructive">
          {t('promptShortcut.missingVariables', { names: missing.join(', ') })}
        </p>
      ) : null}
      {active ? (
        <ShortcutParameters
          key={active.value}
          invocation={active.data}
          mobile={mobile}
          onClose={close}
          onExpand={() => {
            context.onMentionReplace(shortcutEditReplacement(active));
            onActiveIdChange(null);
          }}
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
