/**
 * A five-field cron expression, as five independently editable fields.
 *
 * This exists so "Custom" can be a set of pickers instead of a text box. It is
 * deliberately NOT a general cron implementation: `croner` still owns execution
 * and `validateScheduleTrigger` still owns what may be persisted. All this does
 * is let a person see and change one field at a time.
 *
 * The invariant that makes it safe to point at an existing schedule:
 * `formatCronExpression(parseCronExpression(text)) === text` for every 5-field
 * text. A field is only "claimed" by a structured mode when re-formatting it
 * reproduces the original spelling exactly; anything else — `MON-FRI`, `MON#2`,
 * `JAN`, `L` — stays `raw` and is preserved verbatim while remaining editable.
 * So the picker can never silently rewrite or narrow a rule someone already has.
 */
export type CronField =
  | { mode: 'every' }
  /** `*​/N`, or `A-B/N` when a window is set. */
  | { mode: 'step'; step: number; window?: { from?: number; to?: number } }
  /** Bounds are optional only while the person is still choosing them. */
  | { mode: 'range'; from?: number; to?: number }
  | { mode: 'list'; values: number[] }
  /** Anything this module does not model, kept exactly as authored. */
  | { mode: 'raw'; text: string };

export type CronFieldMode = CronField['mode'];

export type CronFieldId = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'weekday';

export const CRON_FIELD_ORDER = [
  'minute',
  'hour',
  'dayOfMonth',
  'month',
  'weekday',
] as const satisfies readonly CronFieldId[];

export const CRON_FIELD_BOUNDS: Record<CronFieldId, { min: number; max: number }> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  weekday: { min: 0, max: 6 },
};

/**
 * Modes the editor offers, in menu order.
 *
 * Every field offers every mode on purpose. Trimming the menu per field would
 * leave a stored rule in a mode its own picker does not list — a weekday of
 * `1-5` is a `range`, and a menu without `range` would show that field blank
 * and lose it on the next edit.
 */
export const CRON_FIELD_MODES = [
  'every',
  'step',
  'range',
  'list',
  'raw',
] as const satisfies readonly CronFieldMode[];

export function isCronFieldMode(value: string): value is CronFieldMode {
  return (CRON_FIELD_MODES as readonly string[]).includes(value);
}

export type CronFields = Record<CronFieldId, CronField>;

export function formatCronField(field: CronField): string {
  switch (field.mode) {
    case 'every':
      return '*';
    case 'step':
      if (!isCronFieldComplete(field)) throw new Error('Incomplete cron step window');
      return field.window
        ? `${field.window.from}-${field.window.to}/${field.step}`
        : `*/${field.step}`;
    case 'range':
      return `${field.from}-${field.to}`;
    case 'list':
      return field.values.join(',');
    case 'raw':
      return field.text;
  }
  throw new Error('Unsupported cron field mode');
}

function inBounds(id: CronFieldId, ...values: number[]): boolean {
  const { min, max } = CRON_FIELD_BOUNDS[id];
  return values.every((value) => Number.isInteger(value) && value >= min && value <= max);
}

function structuredCronField(text: string, id: CronFieldId): CronField | null {
  if (text === '*') return { mode: 'every' };
  const step = /^\*\/(\d{1,2})$/.exec(text);
  if (step) {
    const value = Number(step[1]);
    return value >= 1 ? { mode: 'step', step: value } : null;
  }
  const windowed = /^(\d{1,2})-(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (windowed) {
    const [from, to, by] = [Number(windowed[1]), Number(windowed[2]), Number(windowed[3])];
    return by >= 1 && from <= to && inBounds(id, from, to)
      ? { mode: 'step', step: by, window: { from, to } }
      : null;
  }
  const range = /^(\d{1,2})-(\d{1,2})$/.exec(text);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    return from <= to && inBounds(id, from, to) ? { mode: 'range', from, to } : null;
  }
  if (/^\d{1,2}(,\d{1,2})*$/.test(text)) {
    const values = text.split(',').map(Number);
    return inBounds(id, ...values) ? { mode: 'list', values } : null;
  }
  return null;
}

/**
 * Interpret one field. Falls back to `raw` whenever the structured reading
 * would not reproduce the original text, which is what keeps the round trip
 * exact for named and extended syntax.
 */
export function parseCronField(text: string, id: CronFieldId): CronField {
  const structured = structuredCronField(text, id);
  if (structured && formatCronField(structured) === text) return structured;
  return { mode: 'raw', text };
}

/** Throws on an incomplete field rather than emitting a short expression. */
export function formatCronExpression(fields: CronFields): string {
  const incomplete = incompleteCronFieldIds(fields);
  if (incomplete.length) throw new Error(`Incomplete cron field: ${incomplete.join(', ')}`);
  return CRON_FIELD_ORDER.map((id) => formatCronField(fields[id])).join(' ');
}

/** `null` when the text is not five whitespace-separated fields. */
export function parseCronExpression(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== CRON_FIELD_ORDER.length) return null;
  const fields = {} as CronFields;
  CRON_FIELD_ORDER.forEach((id, index) => {
    fields[id] = parseCronField(parts[index]!, id);
  });
  return fields;
}

/** True when every field is modelled, so the pickers can show the whole rule. */
export function cronFieldsAreStructured(fields: CronFields): boolean {
  return CRON_FIELD_ORDER.every((id) => fields[id].mode !== 'raw');
}

/**
 * Every value a field selects, or `null` when it cannot be enumerated.
 *
 * `every` enumerates the whole range on purpose: that is what it means, and it
 * is what lets a mode switch preserve the rule instead of resetting it.
 */
export function cronFieldValues(field: CronField, id: CronFieldId): number[] | null {
  const { min, max } = CRON_FIELD_BOUNDS[id];
  const between = (from: number, to: number, step: number) => {
    const values: number[] = [];
    for (let value = from; value <= to; value += step) values.push(value);
    return values;
  };
  switch (field.mode) {
    case 'every':
      return between(min, max, 1);
    case 'step':
      return isCronFieldComplete(field)
        ? between(field.window?.from ?? min, field.window?.to ?? max, field.step)
        : null;
    case 'range':
      return field.from === undefined || field.to === undefined
        ? null
        : between(field.from, field.to, 1);
    case 'list':
      return [...field.values].sort((a, b) => a - b);
    case 'raw':
      return null;
  }
  throw new Error('Unsupported cron field mode');
}

/**
 * A starting value for a mode the person just switched to.
 *
 * Switching representation must not change the schedule, so each mode is seeded
 * from what the field already selects where that is possible: `9-17` becomes the
 * list 9…17 rather than resetting to midnight, and `raw` opens on the current
 * text rather than on a blank.
 */
export function defaultCronField(
  mode: CronFieldMode,
  id: CronFieldId,
  current?: CronField
): CronField {
  const { min } = CRON_FIELD_BOUNDS[id];
  const values = current ? cronFieldValues(current, id) : null;
  switch (mode) {
    case 'every':
      return { mode: 'every' };
    case 'step':
      return current?.mode === 'range'
        ? { mode: 'step', step: 1, window: { from: current.from, to: current.to } }
        : { mode: 'step', step: id === 'minute' ? 15 : 2 };
    case 'range':
      // Never span the whole field from `*`: `1-31` on day-of-month matches
      // every date, and cron ORs day-of-month with weekday, so an exhaustive
      // "range" silently widens the rule exactly as an exhaustive list does.
      // Unset bounds make it an unfinished choice instead.
      return values?.length && current?.mode !== 'every'
        ? { mode: 'range', from: values[0]!, to: values[values.length - 1]! }
        : { mode: 'range' };
    case 'list':
      // Never enumerate `*`. Only `*` means "unrestricted", and for day-of-month
      // and day-of-week cron ORs the two fields — so replacing `*` with 1…31
      // turns a weekdays-only rule into a daily one while looking like a
      // representation change. Leaving `*` starts an empty, incomplete
      // selection instead, which is what the person is about to fill in.
      return { mode: 'list', values: current?.mode === 'every' ? [] : (values ?? [min]) };
    case 'raw':
      return {
        mode: 'raw',
        text: current ? (isCronFieldComplete(current) ? formatCronField(current) : '') : '*',
      };
  }
  throw new Error('Unsupported cron field mode');
}

/** A field the person still has to fill in; it must not be serialized. */
export function isCronFieldComplete(field: CronField): boolean {
  if (field.mode === 'step' && field.window)
    return field.window.from !== undefined && field.window.to !== undefined;
  if (field.mode === 'list') return field.values.length > 0;
  if (field.mode === 'raw') return field.text.trim().length > 0;
  if (field.mode === 'range') return field.from !== undefined && field.to !== undefined;
  return true;
}

export function incompleteCronFieldIds(fields: CronFields): CronFieldId[] {
  return CRON_FIELD_ORDER.filter((id) => !isCronFieldComplete(fields[id]));
}

/**
 * Whether this rule leans on cron's day-of-month OR day-of-week behaviour.
 *
 * With both restricted, a run fires when EITHER matches — the one part of cron
 * that reliably surprises people, so the editor says so out loud.
 */
export function cronFieldsCombineDayAndWeekday(fields: CronFields): boolean {
  return fields.dayOfMonth.mode !== 'every' && fields.weekday.mode !== 'every';
}

/**
 * Replace one field, keeping the rest of the expression untouched.
 *
 * `null` when the text is not five fields, or when the replacement is not a
 * field — a controlled `<Select>` can emit an empty value while resetting, and
 * that must not rewrite the expression.
 */
export function withCronField(
  expression: string,
  id: CronFieldId,
  field: CronField | undefined
): string | null {
  const fields = parseCronExpression(expression);
  if (!fields || !field?.mode) return null;
  try {
    return formatCronExpression({ ...fields, [id]: field });
  } catch {
    // Incomplete; the caller keeps its draft rather than writing a short rule.
    return null;
  }
}
