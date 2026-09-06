import { describe, expect, it } from 'vitest';

import {
  applyScheduleRecurrence,
  changeScheduleRecurrenceKind,
  defaultScheduleRecurrence,
  previewSchedule,
  recurrenceToTrigger,
  sameScheduleRecurrence,
  triggerToRecurrence,
  type ScheduleRecurrence,
  type ScheduleTrigger,
} from '../src';

const ZONE = 'Asia/Shanghai';
/** Fixed instant so every expectation is reproducible: 2026-09-06T12:00Z. */
const NOW = Date.parse('2026-09-06T12:00:00.000Z');

const cron = (expression: string, timeZone = ZONE): ScheduleTrigger => ({
  kind: 'cron',
  expression,
  timeZone,
});

describe('recurrence ⇄ trigger mapping', () => {
  it('names the rules a person can pick', () => {
    expect(triggerToRecurrence(cron('0 9 * * *'))).toEqual({
      kind: 'daily',
      hour: 9,
      minute: 0,
      timeZone: ZONE,
    });
    expect(triggerToRecurrence(cron('30 7 * * 1-5'))).toEqual({
      kind: 'weekdays',
      hour: 7,
      minute: 30,
      timeZone: ZONE,
    });
    expect(triggerToRecurrence(cron('0 9 * * MON-FRI'))).toEqual({
      kind: 'weekdays',
      hour: 9,
      minute: 0,
      timeZone: ZONE,
    });
    expect(triggerToRecurrence(cron('15 18 * * SUN,WED'))).toEqual({
      kind: 'weekly',
      weekdays: [0, 3],
      hour: 18,
      minute: 15,
      timeZone: ZONE,
    });
    expect(triggerToRecurrence(cron('0 9 1 * *'))).toEqual({
      kind: 'monthly',
      dayOfMonth: 1,
      hour: 9,
      minute: 0,
      timeZone: ZONE,
    });
  });

  it('treats 7 and 0 as the same Sunday, and a full week as daily', () => {
    expect(triggerToRecurrence(cron('0 9 * * 7'))).toEqual({
      kind: 'weekly',
      weekdays: [0],
      hour: 9,
      minute: 0,
      timeZone: ZONE,
    });
    expect(triggerToRecurrence(cron('0 9 * * 0-6')).kind).toBe('daily');
  });

  it('keeps rules it cannot name as an editable custom expression', () => {
    for (const expression of [
      '*/15 * * * *',
      '0 9 * * MON#2',
      '0 9,17 * * *',
      '0 9 1 1 *',
      '0 9 1 * 1',
      '0 9 * * FRI-MON',
      '0 9 * *',
    ]) {
      const trigger = cron(expression);
      expect(triggerToRecurrence(trigger)).toEqual({ kind: 'custom', expression, timeZone: ZONE });
    }
  });

  it('passes instant-based rules through unchanged', () => {
    const once: ScheduleTrigger = { kind: 'once', at: '2026-09-07T01:00:00.000Z' };
    const interval: ScheduleTrigger = {
      kind: 'interval',
      everyMs: 3_600_000,
      anchorAt: '2026-09-06T00:00:00.000Z',
    };
    expect(recurrenceToTrigger(triggerToRecurrence(once))).toEqual(once);
    expect(recurrenceToTrigger(triggerToRecurrence(interval))).toEqual(interval);
  });

  it('round-trips every named rule back to the same instants', () => {
    const triggers: ScheduleTrigger[] = [
      cron('0 9 * * *'),
      cron('30 7 * * 1-5'),
      cron('0 9 * * MON-FRI'),
      cron('15 18 * * SUN,WED'),
      cron('0 9 1 * *'),
      cron('0 9 28 * *'),
      cron('*/15 * * * *'),
      { kind: 'once', at: '2026-09-07T01:00:00.000Z' },
      { kind: 'interval', everyMs: 900_000, anchorAt: '2026-09-06T00:00:00.000Z' },
    ];
    for (const trigger of triggers) {
      const replayed = recurrenceToTrigger(triggerToRecurrence(trigger));
      expect(previewSchedule(replayed, 0, NOW, 8)).toEqual(previewSchedule(trigger, 0, NOW, 8));
    }
  });

  it('emits a valid five-field expression for each named rule', () => {
    const cases: [ScheduleRecurrence, string][] = [
      [{ kind: 'daily', hour: 9, minute: 0, timeZone: ZONE }, '0 9 * * *'],
      [{ kind: 'weekdays', hour: 7, minute: 30, timeZone: ZONE }, '30 7 * * 1-5'],
      [
        { kind: 'weekly', weekdays: [3, 0, 3], hour: 18, minute: 15, timeZone: ZONE },
        '15 18 * * 0,3',
      ],
      [{ kind: 'monthly', dayOfMonth: 28, hour: 6, minute: 5, timeZone: ZONE }, '5 6 28 * *'],
    ];
    for (const [recurrence, expression] of cases) {
      expect(recurrenceToTrigger(recurrence)).toEqual(cron(expression));
    }
  });

  it('refuses a weekly rule with no day selected', () => {
    expect(() =>
      recurrenceToTrigger({ kind: 'weekly', weekdays: [], hour: 9, minute: 0, timeZone: ZONE })
    ).toThrow(/at least one day/i);
  });
});

describe('editing an existing schedule', () => {
  it('returns the stored trigger untouched when the rule was not edited', () => {
    // `MON-FRI` and `1-5` are the same rule; re-saving must not rewrite the
    // stored expression, which would invalidate the definition fingerprint.
    const stored = cron('0 9 * * MON-FRI');
    expect(applyScheduleRecurrence(triggerToRecurrence(stored), stored)).toBe(stored);
    const advanced = cron('*/15 9-17 * * *');
    expect(applyScheduleRecurrence(triggerToRecurrence(advanced), advanced)).toBe(advanced);
  });

  it('rewrites only the part the person changed', () => {
    const stored = cron('0 9 * * MON-FRI');
    const edited = { ...triggerToRecurrence(stored), hour: 18 } as ScheduleRecurrence;
    expect(applyScheduleRecurrence(edited, stored)).toEqual(cron('0 18 * * 1-5'));
  });

  it('keeps an unmapped expression editable as custom text', () => {
    const stored = cron('0 9 * * MON#2');
    const recurrence = triggerToRecurrence(stored);
    expect(recurrence).toEqual({ kind: 'custom', expression: '0 9 * * MON#2', timeZone: ZONE });
    // Croner extensions are rejected by the persisted protocol, so an author
    // who opens one must be able to correct it in place.
    expect(
      applyScheduleRecurrence(
        { ...recurrence, expression: '0 9 * * 2' } as ScheduleRecurrence,
        stored
      )
    ).toEqual(cron('0 9 * * 2'));
  });
});

describe('switching between kinds', () => {
  it('carries the time of day across kinds that have one', () => {
    const start: ScheduleRecurrence = { kind: 'daily', hour: 7, minute: 30, timeZone: ZONE };
    expect(changeScheduleRecurrenceKind(start, 'weekly', NOW)).toEqual({
      kind: 'weekly',
      weekdays: [new Date(NOW).getDay()],
      hour: 7,
      minute: 30,
      timeZone: ZONE,
    });
    expect(changeScheduleRecurrenceKind(start, 'weekdays', NOW)).toEqual({
      kind: 'weekdays',
      hour: 7,
      minute: 30,
      timeZone: ZONE,
    });
    expect(changeScheduleRecurrenceKind(start, 'monthly', NOW)).toEqual({
      kind: 'monthly',
      dayOfMonth: new Date(NOW).getDate(),
      hour: 7,
      minute: 30,
      timeZone: ZONE,
    });
  });

  it('promotes weekdays to a pre-filled Mon–Fri weekly rule', () => {
    expect(
      changeScheduleRecurrenceKind(
        { kind: 'weekdays', hour: 9, minute: 0, timeZone: ZONE },
        'weekly',
        NOW
      )
    ).toEqual({ kind: 'weekly', weekdays: [1, 2, 3, 4, 5], hour: 9, minute: 0, timeZone: ZONE });
  });

  it('seeds custom with the equivalent expression instead of a blank field', () => {
    expect(
      changeScheduleRecurrenceKind(
        { kind: 'weekdays', hour: 7, minute: 30, timeZone: ZONE },
        'custom',
        NOW
      )
    ).toEqual({ kind: 'custom', expression: '30 7 * * 1-5', timeZone: ZONE });
  });

  it('is a no-op for the current kind', () => {
    const current = defaultScheduleRecurrence(ZONE);
    expect(changeScheduleRecurrenceKind(current, 'daily', NOW)).toBe(current);
  });

  it('anchors instant-based kinds on the injected clock', () => {
    const start = defaultScheduleRecurrence(ZONE);
    expect(changeScheduleRecurrenceKind(start, 'once', NOW)).toEqual({
      kind: 'once',
      at: new Date(NOW + 3_600_000).toISOString(),
    });
    expect(changeScheduleRecurrenceKind(start, 'interval', NOW)).toEqual({
      kind: 'interval',
      everyMs: 3_600_000,
      anchorAt: new Date(NOW).toISOString(),
    });
  });
});

describe('recurrence equality', () => {
  it('ignores weekday order and duplicates', () => {
    expect(
      sameScheduleRecurrence(
        { kind: 'weekly', weekdays: [3, 1], hour: 9, minute: 0, timeZone: ZONE },
        { kind: 'weekly', weekdays: [1, 3, 3], hour: 9, minute: 0, timeZone: ZONE }
      )
    ).toBe(true);
  });

  it('separates rules that differ only by zone', () => {
    expect(
      sameScheduleRecurrence(
        { kind: 'daily', hour: 9, minute: 0, timeZone: ZONE },
        { kind: 'daily', hour: 9, minute: 0, timeZone: 'Europe/Berlin' }
      )
    ).toBe(false);
  });
});
