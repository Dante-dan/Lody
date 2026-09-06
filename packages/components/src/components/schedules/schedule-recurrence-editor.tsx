import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe } from 'lucide-react';
import {
  SCHEDULE_INTERVAL_UNITS,
  SCHEDULE_RECURRENCE_KINDS,
  SCHEDULE_WEEKDAYS,
  changeScheduleRecurrenceKind,
  getDeviceTimeZone,
  normalizeScheduleWeekdays,
  type ScheduleIntervalUnitId,
  type ScheduleRecurrence,
  type ScheduleRecurrenceKind,
  type ScheduleWeekday,
} from '@lody/shared';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/ui/command';
import { Input } from '@/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { cn } from '@/lib/utils';
import { weekdayNames } from './schedule-format';
import { PropertyRow, ghostSelectTriggerClass, ghostValueClass } from './schedule-property-row';

/** `<input type="datetime-local">` needs a wall-clock string, not an instant. */
const toLocalInput = (iso: string): string => {
  const at = new Date(iso);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const splitInterval = (everyMs: number): { amount: number; unit: ScheduleIntervalUnitId } => {
  for (const unit of [...SCHEDULE_INTERVAL_UNITS].reverse()) {
    if (everyMs % unit.ms === 0) return { amount: everyMs / unit.ms, unit: unit.id };
  }
  return { amount: Math.max(1, Math.round(everyMs / 60_000)), unit: 'minutes' };
};

function TimeZoneField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // `supportedValuesOf` is absent on a few runtimes; the device zone plus the
  // authored zone always keeps the current value selectable.
  const zones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
    return [...new Set([getDeviceTimeZone(), value, ...supported])].filter(Boolean);
  }, [value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button type="button" aria-label={label} disabled={disabled} className={ghostValueClass}>
          <Globe className="size-3.5 shrink-0 opacity-60" />
          <span className="truncate">{value}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder={t('schedules.searchTimeZone', 'Search time zones')} />
          <CommandList>
            <CommandEmpty>{t('schedules.noTimeZone', 'No matching time zone')}</CommandEmpty>
            {zones.map((zone) => (
              <CommandItem
                key={zone}
                value={zone}
                onSelect={() => {
                  onChange(zone);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{zone}</span>
                {zone === value ? <Check className="size-4 shrink-0" /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function WeekdayPicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly ScheduleWeekday[];
  onChange: (next: ScheduleWeekday[]) => void;
  disabled?: boolean;
}) {
  const { i18n } = useTranslation();
  const narrow = weekdayNames(i18n.language, 'narrow');
  const long = weekdayNames(i18n.language, 'long');
  const selected = new Set(value);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {SCHEDULE_WEEKDAYS.map((day) => {
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
                normalizeScheduleWeekdays(
                  on ? [...selected].filter((entry) => entry !== day) : [...selected, day]
                )
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

/**
 * The time rule, as rows that appear only once they apply.
 *
 * Everything a person can pick is a named rule; the persisted trigger is
 * derived by `@lody/shared`. Custom is the last option rather than the default
 * surface, so nobody has to read cron to set a daily reminder — but an existing
 * expression this picker cannot name still opens here, verbatim and editable.
 */
export function ScheduleRecurrenceEditor({
  value,
  onChange,
  now,
  disabled,
}: {
  value: ScheduleRecurrence;
  onChange: (next: ScheduleRecurrence) => void;
  now: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const kindLabels: Record<ScheduleRecurrenceKind, string> = {
    daily: t('schedules.repeat.daily', 'Every day'),
    weekdays: t('schedules.repeat.weekdays', 'Every weekday'),
    weekly: t('schedules.repeat.weekly', 'Every week'),
    monthly: t('schedules.repeat.monthly', 'Every month'),
    interval: t('schedules.repeat.interval', 'Interval'),
    once: t('schedules.repeat.once', 'Once'),
    custom: t('schedules.repeat.custom', 'Custom'),
  };
  const hasWallClock =
    value.kind !== 'once' && value.kind !== 'interval' && value.kind !== 'custom';
  const timeValue = hasWallClock
    ? `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`
    : '';
  const intervalValue = value.kind === 'interval' ? value : null;
  const interval = intervalValue ? splitInterval(intervalValue.everyMs) : null;

  return (
    <>
      <PropertyRow label={t('schedules.repeat.label', 'Repeat')}>
        <Select
          value={value.kind}
          disabled={disabled}
          onValueChange={(kind) =>
            onChange(changeScheduleRecurrenceKind(value, kind as ScheduleRecurrenceKind, now))
          }
        >
          <SelectTrigger
            aria-label={t('schedules.repeat.label', 'Repeat')}
            className={ghostSelectTriggerClass}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULE_RECURRENCE_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kindLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {value.kind === 'weekly' ? (
        <PropertyRow label={t('schedules.repeat.on', 'On')}>
          <WeekdayPicker
            value={value.weekdays}
            disabled={disabled}
            onChange={(weekdays) => onChange({ ...value, weekdays })}
          />
        </PropertyRow>
      ) : null}

      {value.kind === 'monthly' ? (
        <PropertyRow label={t('schedules.repeat.dayOfMonth', 'Day of month')}>
          <Select
            value={String(value.dayOfMonth)}
            disabled={disabled}
            onValueChange={(day) => onChange({ ...value, dayOfMonth: Number(day) })}
          >
            <SelectTrigger
              aria-label={t('schedules.repeat.dayOfMonth', 'Day of month')}
              className={ghostSelectTriggerClass}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PropertyRow>
      ) : null}

      {interval && intervalValue ? (
        <PropertyRow label={t('schedules.repeat.every', 'Every')}>
          <div className="flex items-center justify-end gap-1.5">
            <Input
              type="number"
              min={1}
              step={1}
              disabled={disabled}
              aria-label={t('schedules.repeat.every', 'Every')}
              className="h-8 w-16 text-right"
              value={interval.amount}
              onChange={(event) => {
                const amount = Math.max(1, Math.round(Number(event.target.value) || 1));
                const unit = SCHEDULE_INTERVAL_UNITS.find((entry) => entry.id === interval.unit)!;
                onChange({ ...intervalValue, everyMs: amount * unit.ms });
              }}
            />
            <Select
              value={interval.unit}
              disabled={disabled}
              onValueChange={(id) => {
                const unit = SCHEDULE_INTERVAL_UNITS.find((entry) => entry.id === id)!;
                onChange({ ...intervalValue, everyMs: interval.amount * unit.ms });
              }}
            >
              <SelectTrigger
                aria-label={t('schedules.repeat.unit', 'Interval unit')}
                className={cn(ghostSelectTriggerClass, 'w-auto')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_INTERVAL_UNITS.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {t(`schedules.unit.${unit.id}`, unit.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PropertyRow>
      ) : null}

      {hasWallClock ? (
        <PropertyRow label={t('schedules.repeat.at', 'At')}>
          <input
            type="time"
            required
            disabled={disabled}
            aria-label={t('schedules.repeat.at', 'At')}
            className={cn(ghostValueClass, 'w-auto')}
            value={timeValue}
            onChange={(event) => {
              const [hour, minute] = event.target.value.split(':');
              if (hour === undefined || minute === undefined) return;
              onChange({ ...value, hour: Number(hour), minute: Number(minute) });
            }}
          />
        </PropertyRow>
      ) : null}

      {value.kind === 'once' || value.kind === 'interval' ? (
        <PropertyRow
          label={
            value.kind === 'once'
              ? t('schedules.repeat.runAt', 'Run at')
              : t('schedules.repeat.startingAt', 'Starting')
          }
          hint={t('schedules.deviceZone', 'This device’s time zone ({{zone}})', {
            zone: getDeviceTimeZone(),
          })}
        >
          <input
            type="datetime-local"
            required
            disabled={disabled}
            aria-label={
              value.kind === 'once'
                ? t('schedules.repeat.runAt', 'Run at')
                : t('schedules.repeat.startingAt', 'Starting')
            }
            className={cn(ghostValueClass, 'w-auto')}
            value={toLocalInput(value.kind === 'once' ? value.at : value.anchorAt)}
            onChange={(event) => {
              if (!event.target.value) return;
              const at = new Date(event.target.value).toISOString();
              onChange(value.kind === 'once' ? { ...value, at } : { ...value, anchorAt: at });
            }}
          />
        </PropertyRow>
      ) : null}

      {value.kind === 'custom' ? (
        <PropertyRow
          label={t('schedules.repeat.expression', 'Expression')}
          hint={t('schedules.cronHint', 'Standard five-field cron: minute hour day month weekday.')}
        >
          <Input
            required
            spellCheck={false}
            disabled={disabled}
            aria-label={t('schedules.expression', 'Five-field cron expression')}
            className="h-8 w-full max-w-56 font-mono text-[13px]"
            value={value.expression}
            onChange={(event) => onChange({ ...value, expression: event.target.value })}
          />
        </PropertyRow>
      ) : null}

      {value.kind !== 'once' && value.kind !== 'interval' ? (
        <PropertyRow label={t('schedules.timeZone', 'Time zone')}>
          <TimeZoneField
            value={value.timeZone}
            disabled={disabled}
            label={t('schedules.timeZone', 'Time zone')}
            onChange={(timeZone) => onChange({ ...value, timeZone })}
          />
        </PropertyRow>
      ) : null}
    </>
  );
}
