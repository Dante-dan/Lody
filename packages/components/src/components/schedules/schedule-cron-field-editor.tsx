import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import {
  CRON_FIELD_BOUNDS,
  CRON_FIELD_MODES,
  SCHEDULE_WEEKDAYS,
  defaultCronField,
  isCronFieldMode,
  type CronField,
  type CronFieldId,
  type CronFieldMode,
  type ScheduleWeekday,
} from '@lody/shared';
import { Button } from '@/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/ui/command';
import { Input } from '@/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { cn } from '@/lib/utils';
import { monthNames, weekdayNames } from './schedule-format';
import { PropertyRow, ghostSelectTriggerClass } from './schedule-property-row';

/** Display names for the values of a field; numbers unless months/weekdays. */
export function cronValueLabels(id: CronFieldId, locale?: string): (value: number) => string {
  if (id === 'weekday') {
    const names = weekdayNames(locale, 'short');
    return (value) => names[value] ?? String(value);
  }
  if (id === 'month') {
    const names = monthNames(locale, 'short');
    return (value) => names[value - 1] ?? String(value);
  }
  return (value) => String(value).padStart(id === 'minute' || id === 'hour' ? 2 : 1, '0');
}

function allValues(id: CronFieldId): number[] {
  const { min, max } = CRON_FIELD_BOUNDS[id];
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

/** Searchable multi-select for a `list` field. Weekdays use toggles instead. */
function ValueMultiSelect({
  id,
  values,
  onChange,
  disabled,
  label,
}: {
  id: CronFieldId;
  values: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const labelFor = cronValueLabels(id, i18n.language);
  const selected = new Set(values);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label}
          disabled={disabled}
          className="h-8 max-w-56 gap-1 px-2 text-[13px] font-normal"
        >
          <span className="truncate">
            {values.length
              ? values.map(labelFor).join(', ')
              : t('schedules.cron.chooseValues', 'Choose…')}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={label} />
          <CommandList>
            <CommandEmpty>{t('schedules.cron.noValues', 'No match')}</CommandEmpty>
            {allValues(id).map((value) => (
              <CommandItem
                key={value}
                value={`${labelFor(value)} ${value}`}
                onSelect={() =>
                  onChange(
                    selected.has(value)
                      ? values.filter((entry) => entry !== value)
                      : [...values, value].sort((a, b) => a - b)
                  )
                }
              >
                <span className="min-w-0 flex-1 truncate">{labelFor(value)}</span>
                {selected.has(value) ? <Check className="size-4 shrink-0" /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WeekdayToggles({
  values,
  onChange,
  disabled,
}: {
  values: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const { i18n } = useTranslation();
  const narrow = weekdayNames(i18n.language, 'narrow');
  const long = weekdayNames(i18n.language, 'long');
  const selected = new Set(values);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {SCHEDULE_WEEKDAYS.map((day: ScheduleWeekday) => {
        const on = selected.has(day);
        return (
          <button
            key={day}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={long[day]}
            onClick={() =>
              onChange(
                on
                  ? values.filter((entry) => entry !== day)
                  : [...values, day].sort((a, b) => a - b)
              )
            }
            className={cn(
              'size-7 rounded-md text-xs font-medium transition-colors disabled:opacity-50',
              on
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 text-muted-foreground hover:bg-hover hover:text-foreground'
            )}
          >
            {narrow[day]}
          </button>
        );
      })}
    </div>
  );
}

function NumberBox({
  value,
  onChange,
  min,
  max,
  label,
  disabled,
}: {
  /** `undefined` while a range bound has not been chosen yet. */
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={1}
      disabled={disabled}
      aria-label={label}
      placeholder="—"
      className="h-8 w-16 text-right"
      value={value ?? ''}
      onChange={(event) => {
        if (event.target.value === '') {
          onChange(undefined);
          return;
        }
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
      }}
    />
  );
}

/**
 * One cron field as a mode picker plus whatever that mode needs.
 *
 * Every field keeps a `raw` mode. That is what lets the pickers cover the
 * common shapes without narrowing the rules a person can express — a field the
 * pickers cannot model opens in `raw` with its original text, rather than being
 * approximated or dropped.
 */
export function CronFieldRow({
  id,
  field,
  onChange,
  disabled,
}: {
  id: CronFieldId;
  field: CronField;
  onChange: (next: CronField) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { min, max } = CRON_FIELD_BOUNDS[id];
  const fieldLabels: Record<CronFieldId, string> = {
    minute: t('schedules.cron.minute', 'Minute'),
    hour: t('schedules.cron.hour', 'Hour'),
    dayOfMonth: t('schedules.cron.dayOfMonth', 'Day of month'),
    month: t('schedules.cron.month', 'Month'),
    weekday: t('schedules.cron.weekday', 'Day of week'),
  };
  const unitLabel = (target: CronFieldId): string =>
    ({
      minute: t('schedules.cron.unit.minute', 'minute'),
      hour: t('schedules.cron.unit.hour', 'hour'),
      dayOfMonth: t('schedules.cron.unit.day', 'day'),
      month: t('schedules.cron.unit.month', 'month'),
      weekday: t('schedules.cron.unit.weekday', 'weekday'),
    })[target];
  const unitLabelPlural = (target: CronFieldId): string =>
    ({
      minute: t('schedules.cron.unit.minutes', 'minutes'),
      hour: t('schedules.cron.unit.hours', 'hours'),
      dayOfMonth: t('schedules.cron.unit.days', 'days'),
      month: t('schedules.cron.unit.months', 'months'),
      weekday: t('schedules.cron.unit.weekdays', 'weekdays'),
    })[target];
  const modeLabel = (mode: CronFieldMode): string => {
    if (mode === 'raw') return t('schedules.cron.mode.raw', 'Custom text');
    if (mode === 'every')
      return id === 'weekday'
        ? t('schedules.cron.mode.anyWeekday', 'Any day')
        : t('schedules.cron.mode.every', 'Every {{unit}}', { unit: unitLabel(id) });
    if (mode === 'step')
      return t('schedules.cron.mode.step', 'Every N {{unit}}', { unit: unitLabelPlural(id) });
    if (mode === 'range') return t('schedules.cron.mode.range', 'Between');
    return t('schedules.cron.mode.list', 'On selected');
  };

  const windowed = field.mode === 'step' && field.from !== undefined && field.to !== undefined;
  const windowLabel = windowed
    ? t('schedules.cron.clearWindow', 'Remove range')
    : t('schedules.cron.addWindow', 'Limit range');
  const weekdayToggleValues =
    id === 'weekday' && field.mode === 'list'
      ? field.values
      : id === 'weekday' &&
          field.mode === 'range' &&
          field.from !== undefined &&
          field.to !== undefined
        ? // Fold Sunday-as-7 only after expanding, and only once: a range bound
          // normalized first turns `0-7` into `0-0`. The parser guarantees
          // 0..6 today, and this keeps that true if the bounds ever widen.
          [
            ...new Set(
              Array.from(
                { length: field.to - field.from + 1 },
                (_, index) => (field.from! + index) % 7
              )
            ),
          ].sort((a, b) => a - b)
        : null;

  return (
    <PropertyRow label={fieldLabels[id]}>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {field.mode === 'step' ? (
          <NumberBox
            value={field.step}
            min={1}
            max={max}
            disabled={disabled}
            label={t('schedules.cron.stepFor', 'Interval for {{field}}', {
              field: fieldLabels[id],
            })}
            // A step of 1 is the smallest meaningful interval; an emptied box
            // keeps the field valid rather than half-written.
            onChange={(step) => onChange({ ...field, step: step ?? 1 })}
          />
        ) : null}

        {!weekdayToggleValues && (field.mode === 'range' || windowed) ? (
          <>
            <NumberBox
              value={(field as { from?: number }).from}
              min={min}
              max={max}
              disabled={disabled}
              // Every field can show a range, so the accessible name has to
              // say WHICH range; a bare "From" is ambiguous on the same screen.
              label={t('schedules.cron.fromFor', '{{field}} range start', {
                field: fieldLabels[id],
              })}
              onChange={(from) => onChange({ ...field, from } as CronField)}
            />
            <span className="text-xs text-muted-foreground">{t('schedules.cron.to', 'to')}</span>
            <NumberBox
              value={(field as { to?: number }).to}
              min={min}
              max={max}
              disabled={disabled}
              label={t('schedules.cron.toFor', '{{field}} range end', {
                field: fieldLabels[id],
              })}
              onChange={(to) => onChange({ ...field, to } as CronField)}
            />
          </>
        ) : null}

        {field.mode === 'step' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            // A native title rather than a Radix tooltip: this row renders in a
            // plain form, with no provider above it.
            title={windowLabel}
            aria-label={windowLabel}
            className="size-7 shrink-0 text-muted-foreground"
            onClick={() =>
              onChange(
                windowed
                  ? { mode: 'step', step: field.step }
                  : { mode: 'step', step: field.step, from: min, to: max }
              )
            }
          >
            {windowed ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          </Button>
        ) : null}

        {weekdayToggleValues ? (
          // A weekday `range` such as `1-5` shows as toggles too: numbered
          // From/To boxes are unreadable for days. Toggling is an edit, so
          // emitting an explicit list is a change the person asked for.
          <WeekdayToggles
            values={weekdayToggleValues}
            disabled={disabled}
            onChange={(values) => onChange({ mode: 'list', values })}
          />
        ) : field.mode === 'list' ? (
          <ValueMultiSelect
            id={id}
            values={field.values}
            disabled={disabled}
            label={fieldLabels[id]}
            onChange={(values) => onChange({ mode: 'list', values })}
          />
        ) : null}

        {field.mode === 'raw' ? (
          <Input
            spellCheck={false}
            disabled={disabled}
            aria-label={t('schedules.cron.rawFor', 'Custom text for {{field}}', {
              field: fieldLabels[id],
            })}
            className="h-8 w-28 font-mono text-[13px]"
            value={field.text}
            onChange={(event) => onChange({ mode: 'raw', text: event.target.value })}
          />
        ) : null}

        <Select
          // A weekday range renders as toggles, which IS the "on selected"
          // presentation; showing "Between" next to them would describe a
          // control that is not on screen.
          value={weekdayToggleValues ? 'list' : field.mode}
          disabled={disabled}
          onValueChange={(mode) => {
            if (isCronFieldMode(mode)) onChange(defaultCronField(mode, id, field));
          }}
        >
          <SelectTrigger
            aria-label={t('schedules.cron.modeFor', '{{field}} rule', { field: fieldLabels[id] })}
            className={cn(ghostSelectTriggerClass, 'w-auto')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRON_FIELD_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {modeLabel(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </PropertyRow>
  );
}
