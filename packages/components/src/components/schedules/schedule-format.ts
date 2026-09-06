import type { TFunction } from 'i18next';
import {
  CRON_FIELD_ORDER,
  getDeviceTimeZone,
  normalizeScheduleWeekdays,
  parseCronExpression,
  scheduleRecurrenceTimeZone,
  triggerToRecurrence,
  type CronField,
  type CronFieldId,
  type ScheduleRecurrence,
  type ScheduleTrigger,
  type ScheduleWeekday,
} from '@lody/shared';

/**
 * One vocabulary for every schedule surface.
 *
 * The list, the editor summary and the run history all describe the same rule,
 * so they read it through the same functions. Nothing here formats a raw cron
 * expression at a person: an expression only appears when they chose Custom.
 */

/** Locale weekday names, narrow for toggles and short for summaries. */
export function weekdayNames(
  locale: string | undefined,
  width: 'narrow' | 'short' | 'long'
): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' });
  // 2023-01-01 was a Sunday, which is index 0 in the cron convention.
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2023, 0, 1 + day))));
}

/** Locale month names, indexed from January. */
export function monthNames(locale: string | undefined, width: 'short' | 'long'): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: width, timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, month) =>
    format.format(new Date(Date.UTC(2023, month, 1)))
  );
}

export function formatTimeOfDay(hour: number, minute: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2023, 0, 1, hour, minute)));
}

function formatDuration(t: TFunction, everyMs: number): string {
  const minutes = Math.round(everyMs / 60_000);
  if (minutes % 1440 === 0)
    return t('schedules.everyDays', { count: minutes / 1440, defaultValue: '{{count}} day' });
  if (minutes % 60 === 0)
    return t('schedules.everyHours', { count: minutes / 60, defaultValue: '{{count}} hour' });
  return t('schedules.everyMinutes', { count: minutes, defaultValue: '{{count}} minute' });
}

function formatWeekdayList(weekdays: readonly ScheduleWeekday[], locale?: string): string {
  const names = weekdayNames(locale, 'short');
  const list = normalizeScheduleWeekdays(weekdays).map((day) => names[day] ?? String(day));
  const conjunction = new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' });
  return conjunction.format(list);
}

/** Plain-language sentence for a rule, without its time zone. */
export function describeRecurrence(
  recurrence: ScheduleRecurrence,
  t: TFunction,
  locale?: string
): string {
  switch (recurrence.kind) {
    case 'daily':
      return t('schedules.summary.daily', 'Every day at {{time}}', {
        time: formatTimeOfDay(recurrence.hour, recurrence.minute, locale),
      });
    case 'weekdays':
      return t('schedules.summary.weekdays', 'Every weekday at {{time}}', {
        time: formatTimeOfDay(recurrence.hour, recurrence.minute, locale),
      });
    case 'weekly':
      return recurrence.weekdays.length
        ? t('schedules.summary.weekly', 'Every {{days}} at {{time}}', {
            days: formatWeekdayList(recurrence.weekdays, locale),
            time: formatTimeOfDay(recurrence.hour, recurrence.minute, locale),
          })
        : t('schedules.requireWeekday', 'Choose at least one day of the week.');
    case 'monthly':
      return t('schedules.summary.monthly', 'Day {{day}} of every month at {{time}}', {
        day: recurrence.dayOfMonth,
        time: formatTimeOfDay(recurrence.hour, recurrence.minute, locale),
      });
    case 'interval':
      return t('schedules.summary.interval', 'Every {{duration}}', {
        duration: formatDuration(t, recurrence.everyMs),
      });
    case 'once':
      return t('schedules.summary.once', 'Once, on {{time}}', {
        time: formatInstant(Date.parse(recurrence.at), getDeviceTimeZone(), locale),
      });
    case 'custom':
      return describeCronExpression(recurrence.expression, t, locale);
  }
}

/** i18n suffix for the unit a cron field counts. */
const cronUnitKey = (id: CronFieldId): string =>
  ({
    minute: 'minutes',
    hour: 'hours',
    dayOfMonth: 'days',
    month: 'months',
    weekday: 'weekdays',
  })[id];

/**
 * A custom rule in words.
 *
 * Only the fields that actually constrain anything are mentioned, so
 * `*​/20 9-17 * * 1-5` reads as three clauses rather than five. A field this
 * build cannot name is quoted as-is instead of being guessed at, and an
 * expression that is not five fields falls back to the raw text — the list must
 * never claim a rule means something it does not.
 */
export function describeCronExpression(expression: string, t: TFunction, locale?: string): string {
  const fields = parseCronExpression(expression);
  if (!fields) return expression;
  const list = (id: CronFieldId, values: number[]): string => {
    const names =
      id === 'weekday'
        ? weekdayNames(locale, 'short')
        : id === 'month'
          ? monthNames(locale, 'short')
          : null;
    const label = (value: number) =>
      names ? (names[id === 'month' ? value - 1 : value] ?? String(value)) : String(value);
    return new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(
      values.map(label)
    );
  };
  const clause = (id: CronFieldId, field: CronField): string | null => {
    const unit = t(`schedules.cron.unit.${cronUnitKey(id)}`, cronUnitKey(id));
    switch (field.mode) {
      case 'every':
        return null;
      case 'step':
        return field.from !== undefined && field.to !== undefined
          ? t(
              'schedules.cron.clause.stepInRange',
              'every {{step}} {{unit}} from {{from}} to {{to}}',
              {
                step: field.step,
                unit,
                from: field.from,
                to: field.to,
              }
            )
          : t('schedules.cron.clause.step', 'every {{step}} {{unit}}', { step: field.step, unit });
      case 'range':
        return t('schedules.cron.clause.range', '{{unit}} {{from}} to {{to}}', {
          unit,
          from: field.from,
          to: field.to,
        });
      case 'list':
        return t('schedules.cron.clause.list', '{{unit}} {{values}}', {
          unit,
          values: list(id, field.values),
        });
      case 'raw':
        return t('schedules.cron.clause.raw', '{{unit}} “{{text}}”', { unit, text: field.text });
    }
  };
  const clauses = CRON_FIELD_ORDER.map((id) => clause(id, fields[id])).filter(
    (entry): entry is string => entry !== null
  );
  if (!clauses.length) return t('schedules.cron.clause.everyMinute', 'Every minute');
  return clauses.join(t('schedules.cron.clauseSeparator', ', '));
}

export function describeTrigger(trigger: ScheduleTrigger, t: TFunction, locale?: string): string {
  return describeRecurrence(triggerToRecurrence(trigger), t, locale);
}

/** The zone a trigger's wall clock is authored in. */
export function triggerTimeZone(trigger: ScheduleTrigger): string {
  return scheduleRecurrenceTimeZone(triggerToRecurrence(trigger));
}

export function formatInstant(at: number, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(at));
}

/** Short calendar-relative form for a next run: "Today 09:00", "Tue 09:00". */
export function formatUpcoming(at: number, timeZone: string, now: number, locale?: string): string {
  const day = (value: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(new Date(value));
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
  const today = day(now);
  const target = day(at);
  if (target === today) return time;
  const tomorrow = day(now + 86_400_000);
  const relative = new Intl.DateTimeFormat(locale, {
    timeZone,
    ...(target === tomorrow
      ? {}
      : at - now < 6 * 86_400_000
        ? { weekday: 'short' }
        : { month: 'short', day: 'numeric' }),
  });
  const prefix =
    target === tomorrow
      ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(1, 'day')
      : relative.format(new Date(at));
  return `${prefix} ${time}`;
}

export type ScheduleStatusTone = 'active' | 'attention' | 'muted' | 'progress';
export type ScheduleStatus = { label: string; tone: ScheduleStatusTone };

/**
 * The one status a row shows. Paused wins over every queue state, because a
 * paused schedule's leftover runtime row is history, not a live plan.
 */
export function describeStatus(
  t: TFunction,
  enabled: boolean,
  queueState?: 'due' | 'waiting_for_agent' | 'retrying' | 'blocked'
): ScheduleStatus {
  if (!enabled) return { label: t('schedules.paused', 'Paused'), tone: 'muted' };
  if (queueState === 'blocked')
    return { label: t('schedules.state.blocked', 'Needs attention'), tone: 'attention' };
  if (queueState === 'retrying')
    return { label: t('schedules.state.retrying', 'Retrying dispatch'), tone: 'attention' };
  if (queueState === 'due') return { label: t('schedules.state.due', 'Due'), tone: 'progress' };
  if (queueState === 'waiting_for_agent')
    return { label: t('schedules.state.waiting_for_agent', 'Waiting for Agent'), tone: 'progress' };
  return { label: t('schedules.enabled', 'Enabled'), tone: 'active' };
}
