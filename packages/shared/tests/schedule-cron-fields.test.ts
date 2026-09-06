import { describe, expect, it } from 'vitest';
import { Cron } from 'croner';

import {
  CRON_FIELD_ORDER,
  cronFieldValues,
  cronFieldsAreStructured,
  cronFieldsCombineDayAndWeekday,
  incompleteCronFieldIds,
  isCronFieldComplete,
  defaultCronField,
  formatCronExpression,
  formatCronField,
  parseCronExpression,
  parseCronField,
  previewSchedule,
  validateScheduleTrigger,
  withCronField,
  type CronFieldId,
} from '../src';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');

describe('reading a cron expression as editable fields', () => {
  it('models the shapes the pickers offer', () => {
    expect(parseCronField('*', 'minute')).toEqual({ mode: 'every' });
    expect(parseCronField('*/20', 'minute')).toEqual({ mode: 'step', step: 20 });
    expect(parseCronField('9-17/2', 'hour')).toEqual({ mode: 'step', step: 2, from: 9, to: 17 });
    expect(parseCronField('9-17', 'hour')).toEqual({ mode: 'range', from: 9, to: 17 });
    expect(parseCronField('0,30', 'minute')).toEqual({ mode: 'list', values: [0, 30] });
    expect(parseCronField('5', 'dayOfMonth')).toEqual({ mode: 'list', values: [5] });
  });

  it('keeps anything it does not model verbatim and editable', () => {
    for (const [text, id] of [
      ['MON-FRI', 'weekday'],
      // Sunday-as-7 is out of this module's 0..6 bounds on purpose: the field
      // pickers cannot show a day 7, so the rule stays raw text rather than
      // being approximated. `schedule-recurrence.ts` is what names `0-7`.
      ['0-7', 'weekday'],
      ['1-7', 'weekday'],
      ['MON#2', 'weekday'],
      ['JAN,JUL', 'month'],
      ['L', 'dayOfMonth'],
      ['00', 'minute'],
      ['0-30/0', 'minute'],
      ['17-9', 'hour'],
      ['99', 'minute'],
      ['1-70', 'minute'],
    ] as [string, CronFieldId][]) {
      expect(parseCronField(text, id)).toEqual({ mode: 'raw', text });
    }
  });

  it('round-trips every field byte for byte', () => {
    const corpus = [
      '*/20 9-17 * * 1-5',
      '0 9 * * MON-FRI',
      '0 9,17 * * *',
      '30 7 1,15 * *',
      '0 0 L * *',
      '0 9 * JAN,JUL *',
      '*/5 */2 */3 */4 */5',
      '00 09 * * *',
      '0 9 * * MON#2',
    ];
    for (const expression of corpus) {
      const fields = parseCronExpression(expression)!;
      expect(fields).not.toBeNull();
      expect(formatCronExpression(fields)).toBe(expression);
    }
  });

  it('rejects text that is not five fields', () => {
    expect(parseCronExpression('0 9 * *')).toBeNull();
    expect(parseCronExpression('0 9 * * * *')).toBeNull();
    expect(parseCronExpression('')).toBeNull();
  });

  it('reports whether the whole rule is showable in pickers', () => {
    expect(cronFieldsAreStructured(parseCronExpression('*/20 9-17 * * 1-5')!)).toBe(true);
    expect(cronFieldsAreStructured(parseCronExpression('0 9 * * MON#2')!)).toBe(false);
  });
});

describe('editing one field', () => {
  it('changes only that field', () => {
    expect(withCronField('0 9 * * *', 'minute', { mode: 'step', step: 20 })).toBe('*/20 9 * * *');
    expect(withCronField('*/20 9 * * *', 'hour', { mode: 'range', from: 9, to: 17 })).toBe(
      '*/20 9-17 * * *'
    );
    expect(
      withCronField('*/20 9-17 * * *', 'weekday', { mode: 'list', values: [1, 2, 3, 4, 5] })
    ).toBe('*/20 9-17 * * 1,2,3,4,5');
  });

  it('leaves a neighbouring raw field exactly as it was', () => {
    // Editing the minute of a rule whose weekday is `MON#2` must not normalize
    // the part this module cannot model.
    expect(withCronField('0 9 * * MON#2', 'minute', { mode: 'list', values: [30] })).toBe(
      '30 9 * * MON#2'
    );
  });

  it('refuses to edit text that is not a five-field expression', () => {
    expect(withCronField('0 9 * *', 'minute', { mode: 'every' })).toBeNull();
  });

  it('offers a usable starting value for the modes that have one', () => {
    for (const id of CRON_FIELD_ORDER) {
      for (const mode of ['every', 'step'] as const) {
        const field = defaultCronField(mode, id);
        expect(field.mode).toBe(mode);
        expect(isCronFieldComplete(field)).toBe(true);
        // Round-trippable, so switching modes cannot produce text the pickers
        // would then have to show as raw.
        expect(parseCronField(formatCronField(field), id)).toEqual(field);
      }
    }
  });

  it('starts a selection unfinished rather than inventing one', () => {
    for (const id of CRON_FIELD_ORDER) {
      for (const mode of ['list', 'range'] as const) {
        // From `*` there is no equivalent finite value, so the person picks.
        const fromEvery = defaultCronField(mode, id, { mode: 'every' });
        expect(fromEvery.mode).toBe(mode);
        expect(isCronFieldComplete(fromEvery)).toBe(false);
      }
      // From a finite field the values carry over, so it stays complete.
      const finite = defaultCronField('range', id, { mode: 'list', values: [1, 3] });
      expect(finite).toEqual({ mode: 'range', from: 1, to: 3 });
      expect(isCronFieldComplete(finite)).toBe(true);
    }
  });

  it('preserves the rule when the representation changes', () => {
    // `9-17` must not reset to midnight when it becomes a list of hours.
    expect(defaultCronField('list', 'hour', { mode: 'range', from: 9, to: 17 })).toEqual({
      mode: 'list',
      values: [9, 10, 11, 12, 13, 14, 15, 16, 17],
    });
    expect(defaultCronField('range', 'hour', { mode: 'list', values: [9, 18] })).toEqual({
      mode: 'range',
      from: 9,
      to: 18,
    });
    expect(defaultCronField('step', 'hour', { mode: 'range', from: 9, to: 17 })).toEqual({
      mode: 'step',
      step: 1,
      from: 9,
      to: 17,
    });
    // The same instants, before and after the switch.
    for (const [from, to] of [
      [{ mode: 'range', from: 9, to: 17 } as const, 'list'],
      [{ mode: 'range', from: 9, to: 17 } as const, 'step'],
    ] as const) {
      const next = defaultCronField(to, 'hour', from);
      expect(cronFieldValues(next, 'hour')).toEqual(cronFieldValues(from, 'hour'));
    }
  });

  it('enumerates what a field selects', () => {
    expect(cronFieldValues({ mode: 'step', step: 4, from: 9, to: 17 }, 'hour')).toEqual([
      9, 13, 17,
    ]);
    expect(cronFieldValues({ mode: 'every' }, 'weekday')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(cronFieldValues({ mode: 'raw', text: 'MON#2' }, 'weekday')).toBeNull();
  });

  it('opens the raw escape hatch on the text that is already there', () => {
    expect(defaultCronField('raw', 'hour', { mode: 'range', from: 9, to: 17 })).toEqual({
      mode: 'raw',
      text: '9-17',
    });
    expect(defaultCronField('raw', 'weekday')).toEqual({ mode: 'raw', text: '*' });
  });
});

describe('what the pickers can build stays executable', () => {
  it('produces expressions the persisted protocol accepts', () => {
    const built = [
      formatCronExpression({
        minute: { mode: 'step', step: 20 },
        hour: { mode: 'range', from: 9, to: 17 },
        dayOfMonth: { mode: 'every' },
        month: { mode: 'every' },
        weekday: { mode: 'list', values: [1, 2, 3, 4, 5] },
      }),
      formatCronExpression({
        minute: { mode: 'list', values: [0, 30] },
        hour: { mode: 'step', step: 2, from: 8, to: 20 },
        dayOfMonth: { mode: 'list', values: [1, 15] },
        month: { mode: 'list', values: [1, 7] },
        weekday: { mode: 'every' },
      }),
    ];
    expect(built[0]).toBe('*/20 9-17 * * 1,2,3,4,5');
    expect(built[1]).toBe('0,30 8-20/2 1,15 1,7 *');
    for (const expression of built) {
      const trigger = validateScheduleTrigger({
        kind: 'cron',
        expression,
        timeZone: 'Asia/Shanghai',
      });
      expect(previewSchedule(trigger, 0, NOW, 3)).toHaveLength(3);
    }
  });

  it('keeps the executable meaning when a field is edited', () => {
    const before = validateScheduleTrigger({
      kind: 'cron',
      expression: '0 9 * * *',
      timeZone: 'UTC',
    });
    const after = validateScheduleTrigger({
      kind: 'cron',
      expression: withCronField('0 9 * * *', 'hour', { mode: 'list', values: [9, 17] })!,
      timeZone: 'UTC',
    });
    expect(previewSchedule(before, 0, NOW, 2)).toEqual([
      Date.parse('2026-09-07T09:00:00Z'),
      Date.parse('2026-09-08T09:00:00Z'),
    ]);
    expect(previewSchedule(after, 0, NOW, 2)).toEqual([
      Date.parse('2026-09-06T17:00:00Z'),
      Date.parse('2026-09-07T09:00:00Z'),
    ]);
  });
});

describe('switching a field mode must not change what fires', () => {
  /** Real execution, not just text: does this rule fire at that instant? */
  const fires = (expression: string, iso: string) =>
    new Cron(expression, { timezone: 'UTC', paused: true, domAndDow: false }).match(new Date(iso));

  it('never enumerates `*`, because day-of-month and weekday are ORed', () => {
    const weekdaysOnly = '*/20 9-17 * * 1-5';
    const saturday = '2026-09-12T09:00:00Z';
    expect(fires(weekdaysOnly, saturday)).toBe(false);

    // Choosing "On selected" for day-of-month starts EMPTY. Enumerating 1…31
    // instead would satisfy the day clause on every date, and the OR would make
    // this weekdays-only rule fire on Saturday.
    const next = defaultCronField('list', 'dayOfMonth', { mode: 'every' });
    expect(next).toEqual({ mode: 'list', values: [] });
    expect(isCronFieldComplete(next)).toBe(false);
    expect(() =>
      formatCronExpression({ ...parseCronExpression(weekdaysOnly)!, dayOfMonth: next })
    ).toThrow(/incomplete/i);

    // The enumeration this used to produce really does flip the rule.
    const enumerated = formatCronExpression({
      ...parseCronExpression(weekdaysOnly)!,
      dayOfMonth: { mode: 'list', values: Array.from({ length: 31 }, (_, i) => i + 1) },
    });
    expect(fires(enumerated, saturday)).toBe(true);
  });

  it('preserves the fired instants when a finite field changes representation', () => {
    const base = parseCronExpression('0 9-17 * * *')!;
    const asList = defaultCronField('list', 'hour', base.hour);
    const asStep = defaultCronField('step', 'hour', base.hour);
    const probes = Array.from(
      { length: 24 },
      (_, hour) => `2026-09-12T${String(hour).padStart(2, '0')}:00:00Z`
    );
    for (const replacement of [asList, asStep]) {
      const expression = formatCronExpression({ ...base, hour: replacement });
      expect(probes.map((at) => fires(expression, at))).toEqual(
        probes.map((at) => fires('0 9-17 * * *', at))
      );
    }
  });

  it('reports an incomplete field instead of emitting a short expression', () => {
    const fields = parseCronExpression('*/20 9-17 * * 1-5')!;
    const emptied = { ...fields, weekday: { mode: 'list', values: [] } as const };
    expect(incompleteCronFieldIds(emptied)).toEqual(['weekday']);
    expect(() => formatCronExpression(emptied)).toThrow(/incomplete/i);
    // The old behaviour produced `*/20 9-17 * * ` — four fields, which then
    // failed to parse and collapsed the whole editor.
    expect(withCronField('*/20 9-17 * * 1-5', 'weekday', { mode: 'list', values: [] })).toBeNull();
    expect(withCronField('*/20 9-17 * * 1-5', 'hour', { mode: 'raw', text: '  ' })).toBeNull();
  });

  it('flags the day-of-month OR day-of-week combination', () => {
    expect(cronFieldsCombineDayAndWeekday(parseCronExpression('0 9 * * 1-5')!)).toBe(false);
    expect(cronFieldsCombineDayAndWeekday(parseCronExpression('0 9 1 * *')!)).toBe(false);
    expect(cronFieldsCombineDayAndWeekday(parseCronExpression('0 9 1 * 1-5')!)).toBe(true);
  });
});
