import {
  formatCronExpression,
  incompleteCronFieldIds,
  parseCronExpression,
  type CronFields,
} from './schedule-cron-fields';
import { validateScheduleTrigger } from './schedule-time';
import type { ScheduleTrigger } from './schedule-types';

/**
 * The human-facing shape of a time rule.
 *
 * The persisted protocol stays `once | interval | cron` — cron already
 * expresses everything the picker offers, and widening the stored union would
 * force every reader (CLI engine, ledger, MCP) to learn a second calendar.
 * Instead this module is the single, tested translation layer between what a
 * person picks and what the machine executes, in both directions.
 *
 * Two properties matter and are covered by tests:
 * - Every recurrence maps to exactly one valid trigger.
 * - Every trigger maps back to a recurrence that is either an exact structural
 *   match (`custom` keeps the authored expression verbatim) or replays the same
 *   instants. A rule this module cannot name is never rewritten or dropped; it
 *   surfaces as `custom` so it stays visible and editable.
 */
export type ScheduleWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleTimeOfDay = {
  /** 0–23, in `timeZone`. */
  hour: number;
  /** 0–59, in `timeZone`. */
  minute: number;
  /** IANA zone the wall time is authored in. */
  timeZone: string;
};

export type ScheduleRecurrence =
  | ({ kind: 'daily' } & ScheduleTimeOfDay)
  | ({ kind: 'weekdays' } & ScheduleTimeOfDay)
  | ({ kind: 'weekly'; weekdays: ScheduleWeekday[] } & ScheduleTimeOfDay)
  | ({ kind: 'monthly'; dayOfMonth: number } & ScheduleTimeOfDay)
  | { kind: 'interval'; everyMs: number; anchorAt: string }
  | { kind: 'once'; at: string }
  /**
   * The five cron fields as the person is editing them, plus an optional
   * whole-expression text draft while they type one.
   *
   * The FIELDS are the state, not a string that gets re-parsed on every
   * keystroke. Re-deriving the edit state from a serialized expression is what
   * made a `raw` field snap back to a range as soon as its text parsed, and
   * made an emptied selection collapse the whole editor.
   */
  | { kind: 'custom'; fields: CronFields; timeZone: string; draftText?: string };

export type ScheduleRecurrenceKind = ScheduleRecurrence['kind'];

/** Menu order: the common answers first, the escape hatch last. */
export const SCHEDULE_RECURRENCE_KINDS = [
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'interval',
  'once',
  'custom',
] as const satisfies readonly ScheduleRecurrenceKind[];

export const SCHEDULE_WEEKDAYS: readonly ScheduleWeekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Minute steps offered by the interval editor, smallest first. */
export const SCHEDULE_INTERVAL_UNITS = [
  { id: 'minutes', ms: 60_000 },
  { id: 'hours', ms: 3_600_000 },
  { id: 'days', ms: 86_400_000 },
] as const;
export type ScheduleIntervalUnitId = (typeof SCHEDULE_INTERVAL_UNITS)[number]['id'];

const CRON_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WORKWEEK: readonly ScheduleWeekday[] = [1, 2, 3, 4, 5];

function parseFixedNumber(field: string, min: number, max: number): number | null {
  if (!/^\d{1,2}$/.test(field)) return null;
  const value = Number(field);
  return value >= min && value <= max ? value : null;
}

/**
 * A day-of-week token as cron writes it: 0–7, where 0 AND 7 both mean Sunday.
 *
 * Folding 7 onto 0 here would be wrong, because a RANGE is expanded from these
 * bounds: `0-7` and `1-7` are every day, and normalizing the upper bound first
 * turned `0-7` into the empty-looking range 0-0 and read it as "Sundays only".
 * Normalization happens after expansion, in `parseWeekdayField`.
 */
function parseWeekdayToken(token: string): number | null {
  const named = CRON_DAY_NAMES.indexOf(token.toUpperCase());
  if (named >= 0) return named;
  if (!/^\d$/.test(token)) return null;
  const value = Number(token);
  return value <= 7 ? value : null;
}

/**
 * Expand a day-of-week field into a normalized Sunday=0 set.
 *
 * Deliberately conservative: step syntax and wrap-around ranges return `null`
 * so the rule stays `custom` rather than being approximated.
 */
function parseWeekdayField(field: string): ScheduleWeekday[] | null {
  const found = new Set<ScheduleWeekday>();
  // Sunday is 0 or 7; fold only after the range has been expanded.
  const add = (day: number) => found.add((day % 7) as ScheduleWeekday);
  for (const part of field.split(',')) {
    if (part.includes('/') || part === '') return null;
    const bounds = part.split('-');
    if (bounds.length === 1) {
      const single = parseWeekdayToken(bounds[0]!);
      if (single === null) return null;
      add(single);
      continue;
    }
    if (bounds.length !== 2) return null;
    const from = parseWeekdayToken(bounds[0]!);
    const to = parseWeekdayToken(bounds[1]!);
    if (from === null || to === null || from > to) return null;
    for (let day = from; day <= to; day++) add(day);
  }
  return found.size ? [...found].sort((a, b) => a - b) : null;
}

export function normalizeScheduleWeekdays(weekdays: readonly ScheduleWeekday[]): ScheduleWeekday[] {
  return [...new Set(weekdays)].sort((a, b) => a - b);
}

function sameWeekdays(a: readonly ScheduleWeekday[], b: readonly ScheduleWeekday[]): boolean {
  const left = normalizeScheduleWeekdays(a);
  const right = normalizeScheduleWeekdays(b);
  return left.length === right.length && left.every((day, index) => day === right[index]);
}

export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** An unrestricted rule, used only to seed a not-yet-parseable text draft. */
const EMPTY_FIELDS = (): CronFields => parseCronExpression('* * * * *')!;

/** Interpretation of a trigger a person can read and edit field by field. */
export function triggerToRecurrence(trigger: ScheduleTrigger): ScheduleRecurrence {
  if (trigger.kind === 'once') return { kind: 'once', at: trigger.at };
  if (trigger.kind === 'interval')
    return { kind: 'interval', everyMs: trigger.everyMs, anchorAt: trigger.anchorAt };
  const parsed = parseCronExpression(trigger.expression);
  const custom: ScheduleRecurrence = parsed
    ? { kind: 'custom', fields: parsed, timeZone: trigger.timeZone }
    : // A persisted trigger is always five fields, so this is only reachable
      // for text a person is still typing.
      {
        kind: 'custom',
        fields: EMPTY_FIELDS(),
        timeZone: trigger.timeZone,
        draftText: trigger.expression,
      };
  const fields = trigger.expression.trim().split(/\s+/);
  if (fields.length !== 5) return custom;
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];
  const minute = parseFixedNumber(minuteField, 0, 59);
  const hour = parseFixedNumber(hourField, 0, 23);
  if (minute === null || hour === null || monthField !== '*') return custom;
  const time: ScheduleTimeOfDay = { hour, minute, timeZone: trigger.timeZone };
  if (dayField === '*') {
    if (weekdayField === '*') return { kind: 'daily', ...time };
    const weekdays = parseWeekdayField(weekdayField);
    if (!weekdays) return custom;
    if (sameWeekdays(weekdays, WORKWEEK)) return { kind: 'weekdays', ...time };
    if (weekdays.length === 7) return { kind: 'daily', ...time };
    return { kind: 'weekly', weekdays, ...time };
  }
  if (weekdayField !== '*') return custom;
  const dayOfMonth = parseFixedNumber(dayField, 1, 31);
  if (dayOfMonth === null) return custom;
  return { kind: 'monthly', dayOfMonth, ...time };
}

/** Throws with an actionable message when the recurrence is not yet complete. */
export function recurrenceToTrigger(recurrence: ScheduleRecurrence): ScheduleTrigger {
  if (recurrence.kind === 'once')
    return validateScheduleTrigger({ kind: 'once', at: recurrence.at });
  if (recurrence.kind === 'interval')
    return validateScheduleTrigger({
      kind: 'interval',
      everyMs: recurrence.everyMs,
      anchorAt: recurrence.anchorAt,
    });
  if (recurrence.kind === 'custom')
    return validateScheduleTrigger({
      kind: 'cron',
      expression: customRecurrenceExpression(recurrence),
      timeZone: recurrence.timeZone,
    });
  const weekdayField =
    recurrence.kind === 'weekdays'
      ? '1-5'
      : recurrence.kind === 'weekly'
        ? normalizeScheduleWeekdays(recurrence.weekdays).join(',')
        : '*';
  if (!weekdayField) throw new Error('Choose at least one day of the week');
  const dayField = recurrence.kind === 'monthly' ? String(recurrence.dayOfMonth) : '*';
  return validateScheduleTrigger({
    kind: 'cron',
    expression: `${recurrence.minute} ${recurrence.hour} ${dayField} * ${weekdayField}`,
    timeZone: recurrence.timeZone,
  });
}

export function sameScheduleRecurrence(a: ScheduleRecurrence, b: ScheduleRecurrence): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'once' && b.kind === 'once') return a.at === b.at;
  if (a.kind === 'interval' && b.kind === 'interval')
    return a.everyMs === b.everyMs && a.anchorAt === b.anchorAt;
  if (a.kind === 'custom' && b.kind === 'custom')
    return (
      a.timeZone === b.timeZone && customRecurrenceSignature(a) === customRecurrenceSignature(b)
    );
  if (a.kind === 'interval' || a.kind === 'once' || a.kind === 'custom') return false;
  if (b.kind === 'interval' || b.kind === 'once' || b.kind === 'custom') return false;
  if (a.hour !== b.hour || a.minute !== b.minute || a.timeZone !== b.timeZone) return false;
  if (a.kind === 'weekly' && b.kind === 'weekly') return sameWeekdays(a.weekdays, b.weekdays);
  if (a.kind === 'monthly' && b.kind === 'monthly') return a.dayOfMonth === b.dayOfMonth;
  return true;
}

/**
 * Trigger for a saved edit.
 *
 * When the person did not touch the time rule, the previously stored trigger is
 * returned unchanged — opening an advanced `MON-FRI` schedule and pressing Save
 * must not silently rewrite it to `1-5` and invalidate its fingerprint.
 */
export function applyScheduleRecurrence(
  recurrence: ScheduleRecurrence,
  previous?: ScheduleTrigger
): ScheduleTrigger {
  if (previous && sameScheduleRecurrence(triggerToRecurrence(previous), recurrence))
    return previous;
  return recurrenceToTrigger(recurrence);
}

export function defaultScheduleRecurrence(timeZone = getDeviceTimeZone()): ScheduleRecurrence {
  return { kind: 'daily', hour: 9, minute: 0, timeZone };
}

function timeOfDayOf(recurrence: ScheduleRecurrence): ScheduleTimeOfDay {
  if (recurrence.kind === 'once') {
    const at = new Date(recurrence.at);
    return { hour: at.getHours(), minute: at.getMinutes(), timeZone: getDeviceTimeZone() };
  }
  if (recurrence.kind === 'interval') {
    const anchor = new Date(recurrence.anchorAt);
    return { hour: anchor.getHours(), minute: anchor.getMinutes(), timeZone: getDeviceTimeZone() };
  }
  if (recurrence.kind === 'custom') return { hour: 9, minute: 0, timeZone: recurrence.timeZone };
  return { hour: recurrence.hour, minute: recurrence.minute, timeZone: recurrence.timeZone };
}

/**
 * Switch the picker between kinds while carrying over everything the new kind
 * can still hold, so changing "Every day" to "Every week" does not reset 07:30
 * back to a default. Switching to `custom` seeds the equivalent expression, so
 * the escape hatch starts from the rule the person already had.
 */
export function changeScheduleRecurrenceKind(
  current: ScheduleRecurrence,
  kind: ScheduleRecurrenceKind,
  now: number
): ScheduleRecurrence {
  if (current.kind === kind) return current;
  const time = timeOfDayOf(current);
  switch (kind) {
    case 'daily':
      return { kind, ...time };
    case 'weekdays':
      return { kind, ...time };
    case 'weekly':
      return {
        kind,
        weekdays:
          current.kind === 'weekdays' ? [...WORKWEEK] : [new Date(now).getDay() as ScheduleWeekday],
        ...time,
      };
    case 'monthly':
      return { kind, dayOfMonth: new Date(now).getDate(), ...time };
    case 'interval':
      return { kind, everyMs: 3_600_000, anchorAt: new Date(now).toISOString() };
    case 'once':
      return { kind, at: new Date(now + 3_600_000).toISOString() };
    case 'custom': {
      // Seed the pickers with the rule the person already has, so Custom opens
      // on their schedule rather than on a blank one.
      const seed = (expression: string) => parseCronExpression(expression);
      try {
        const trigger = recurrenceToTrigger(current);
        if (trigger.kind === 'cron') {
          const fields = seed(trigger.expression);
          if (fields) return { kind, fields, timeZone: trigger.timeZone };
        }
      } catch {
        // Fall through to a readable default rather than blocking the switch.
      }
      return {
        kind,
        fields: seed(`${time.minute} ${time.hour} * * *`)!,
        timeZone: time.timeZone,
      };
    }
  }
  throw new Error('Unsupported schedule recurrence');
}

/**
 * The expression a custom rule currently means.
 *
 * While a whole-expression text draft is open that draft IS the rule, even
 * before it parses — `validateScheduleTrigger` then rejects it and the editor
 * shows why, instead of the draft being silently replaced by the last good one.
 */
export function customRecurrenceExpression(
  recurrence: Extract<ScheduleRecurrence, { kind: 'custom' }>
): string {
  return recurrence.draftText ?? formatCronExpression(recurrence.fields);
}

/** Comparable form that tolerates an incomplete draft. */
function customRecurrenceSignature(
  recurrence: Extract<ScheduleRecurrence, { kind: 'custom' }>
): string {
  if (recurrence.draftText !== undefined) return `text:${recurrence.draftText}`;
  const incomplete = incompleteCronFieldIds(recurrence.fields);
  if (incomplete.length) return `incomplete:${incomplete.join(',')}`;
  return formatCronExpression(recurrence.fields);
}

/** Parts of a custom rule the person still has to fill in. */
export function incompleteScheduleRecurrenceFields(recurrence: ScheduleRecurrence): string[] {
  if (recurrence.kind !== 'custom' || recurrence.draftText !== undefined) return [];
  return incompleteCronFieldIds(recurrence.fields);
}

/** The zone a recurrence's wall clock is read in; instants use the device. */
export function scheduleRecurrenceTimeZone(recurrence: ScheduleRecurrence): string {
  return recurrence.kind === 'once' || recurrence.kind === 'interval'
    ? getDeviceTimeZone()
    : recurrence.timeZone;
}
