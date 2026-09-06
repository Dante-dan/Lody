// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../../locales/en.json';
import { ScheduleForm } from '../src/components/schedules/schedule-view';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Fixed clock: the preview and "next run" copy must not depend on the wall time. */
const NOW = Date.parse('2026-09-06T09:12:00+08:00');

describe('Schedule editor', () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: ComponentProps<typeof ScheduleForm>;
  beforeAll(async () => {
    await i18next.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } } });
  });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    props = {
      initial: {
        title: 'Daily review',
        prompt: 'Review recent changes.',
        trigger: { kind: 'cron', expression: '0 9 * * *', timeZone: 'Asia/Shanghai' },
        misfire: 'run_once',
        overlap: 'queue_one',
      },
      saving: false,
      now: NOW,
      onSave: vi.fn(),
    };
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = () => act(() => root.render(<ScheduleForm {...props} />));
  const button = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const submit = () =>
    act(() => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  const requirements = () =>
    container.querySelector('form > div:last-of-type [aria-live="polite"]')!;
  const field = (label: string) =>
    container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  const type = (label: string, text: string) =>
    act(() => {
      const element = field(label);
      const setter = Object.getOwnPropertyDescriptor(
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype,
        'value'
      )!.set!;
      setter.call(element, text);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('saves without any confirmation checkbox', () => {
    render();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button().disabled).toBe(false);
    expect(requirements().textContent).toBe('');
    submit();
    expect(props.onSave).toHaveBeenCalledWith(props.initial);
  });

  it('names its fields without a visible label, using placeholders as the hint', () => {
    render();
    expect(field(en['schedules.name']).placeholder).toBe(en['schedules.namePlaceholder']);
    expect(field(en['schedules.prompt']).placeholder).toBe(en['schedules.promptPlaceholder']);
    // The accessible names exist, but no <label> text takes up vertical space.
    expect(container.querySelectorAll('label')).toHaveLength(0);
  });

  it('keeps permission and machine blockers visible and guards submission', () => {
    props.saveBlockers = [en['schedules.choosePermission'], en['schedules.upgrade']];
    render();
    submit();
    expect(requirements().textContent).toContain(en['schedules.choosePermission']);
    expect(requirements().textContent).toContain(en['schedules.upgrade']);
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-describedby')).toBe(requirements().id);
    expect(props.onSave).not.toHaveBeenCalled();
    props.saveBlockers = [];
    render();
    expect(button().disabled).toBe(false);
    expect(requirements().textContent).toBe('');
  });

  it('explains empty content without requiring a submit', () => {
    render();
    type(en['schedules.name'], ' ');
    type(en['schedules.prompt'], '');
    submit();
    expect(requirements().textContent).toContain(en['schedules.requireName']);
    expect(requirements().textContent).toContain(en['schedules.requirePrompt']);
    expect(button().disabled).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('rejects an invalid custom expression it was opened with', () => {
    props.initial = {
      ...props.initial,
      trigger: { kind: 'cron', expression: 'invalid', timeZone: 'Asia/Shanghai' },
    };
    render();
    expect(requirements().textContent).toContain(en['schedules.invalidTime']);
    expect(button().disabled).toBe(true);
    submit();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('does not resubmit while saving', () => {
    props.saving = true;
    render();
    submit();
    expect(button().textContent).toBe(en['schedules.saving']);
    expect(button().disabled).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });
});

describe('Time rules a person opens', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSave: ReturnType<typeof vi.fn>;
  beforeAll(async () => {
    if (!i18next.isInitialized)
      await i18next
        .use(initReactI18next)
        .init({ lng: 'en', resources: { en: { translation: en } } });
  });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onSave = vi.fn();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  /**
   * A fresh root per case: `initial` seeds uncontrolled editor state, so
   * re-rendering the same root would keep the previous rule's picker.
   */
  const open = (trigger: ComponentProps<typeof ScheduleForm>['initial']['trigger']) => {
    act(() => root.unmount());
    container.replaceChildren();
    root = createRoot(container);
    act(() =>
      root.render(
        <ScheduleForm
          now={NOW}
          saving={false}
          onSave={onSave}
          initial={{
            title: 'Daily review',
            prompt: 'Review recent changes.',
            trigger,
            misfire: 'run_once',
            overlap: 'queue_one',
          }}
        />
      )
    );
  };
  const submit = () =>
    act(() => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  const repeatValue = () =>
    container.querySelector(`[aria-label="${en['schedules.repeat.label']}"]`)!.textContent;

  it('opens a weekday rule as “Every weekday”, not as cron text', () => {
    open({ kind: 'cron', expression: '0 9 * * MON-FRI', timeZone: 'Asia/Shanghai' });
    expect(repeatValue()).toBe(en['schedules.repeat.weekdays']);
    expect(container.querySelector(`[aria-label="${en['schedules.expression']}"]`)).toBeNull();
    expect(container.textContent).toContain('Asia/Shanghai');
  });

  it('opens each named rule under its own name', () => {
    const cases: [ComponentProps<typeof ScheduleForm>['initial']['trigger'], string][] = [
      [{ kind: 'cron', expression: '0 9 * * *', timeZone: 'UTC' }, en['schedules.repeat.daily']],
      [{ kind: 'cron', expression: '0 9 * * 1,3', timeZone: 'UTC' }, en['schedules.repeat.weekly']],
      [{ kind: 'cron', expression: '0 9 5 * *', timeZone: 'UTC' }, en['schedules.repeat.monthly']],
      [{ kind: 'once', at: '2026-09-07T01:00:00.000Z' }, en['schedules.repeat.once']],
      [
        { kind: 'interval', everyMs: 3_600_000, anchorAt: '2026-09-06T00:00:00.000Z' },
        en['schedules.repeat.interval'],
      ],
    ];
    for (const [trigger, label] of cases) {
      open(trigger);
      expect(repeatValue()).toBe(label);
    }
  });

  it('opens an unmappable expression as Custom and re-emits it byte for byte', () => {
    const trigger = {
      kind: 'cron',
      expression: '*/20 9-17 * * 1-5',
      timeZone: 'Asia/Shanghai',
    } as const;
    open(trigger);
    expect(repeatValue()).toBe(en['schedules.repeat.custom']);
    // Custom is pickers, not a cron text box; the text field is opt-in.
    expect(container.querySelector(`[aria-label="${en['schedules.expression']}"]`)).toBeNull();
    submit();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].trigger).toEqual(trigger);
  });

  it('re-emits a named rule unchanged when the person only edited the prompt', () => {
    // `MON-FRI` is not how this editor spells the workweek, but re-saving an
    // untouched rule must not rewrite it and invalidate its fingerprint.
    const trigger = {
      kind: 'cron',
      expression: '0 9 * * MON-FRI',
      timeZone: 'Asia/Shanghai',
    } as const;
    open(trigger);
    act(() => {
      const prompt = container.querySelector<HTMLTextAreaElement>(
        `[aria-label="${en['schedules.prompt']}"]`
      )!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        prompt,
        'Different prompt.'
      );
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
    });
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toBe(trigger);
    expect(onSave.mock.calls[0]![0].prompt).toBe('Different prompt.');
  });

  it('shows the preview in the rule’s own zone', () => {
    open({ kind: 'cron', expression: '0 9 * * *', timeZone: 'America/New_York' });
    const preview = container.querySelector('[aria-live="polite"]')!;
    expect(preview.textContent).toContain(en['schedules.nextRuns']);
    expect(preview.textContent).toContain('America/New_York');
  });
});

describe('Building a custom rule with pickers', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSave: ReturnType<typeof vi.fn>;
  beforeAll(async () => {
    if (!i18next.isInitialized)
      await i18next
        .use(initReactI18next)
        .init({ lng: 'en', resources: { en: { translation: en } } });
  });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onSave = vi.fn();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const open = (trigger: ComponentProps<typeof ScheduleForm>['initial']['trigger']) => {
    act(() => root.unmount());
    container.replaceChildren();
    root = createRoot(container);
    act(() =>
      root.render(
        <ScheduleForm
          now={NOW}
          saving={false}
          onSave={onSave}
          initial={{
            title: 'Build sweep',
            prompt: 'Check the build.',
            trigger,
            misfire: 'skip',
            overlap: 'skip',
          }}
        />
      )
    );
  };
  const byLabel = <T extends Element>(label: string) =>
    container.querySelector<T>(`[aria-label="${label}"]`);
  const setNumber = (label: string, value: number) =>
    act(() => {
      const input = byLabel<HTMLInputElement>(label)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        String(value)
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const setText = (label: string, value: string) =>
    act(() => {
      const input = byLabel<HTMLInputElement>(label)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const click = (element: Element | null) =>
    act(() => {
      (element as HTMLElement).click();
    });
  const submit = () =>
    act(() => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  const savedExpression = () => {
    const trigger = onSave.mock.calls.at(-1)![0].trigger;
    if (trigger.kind !== 'cron') throw new Error('expected a cron trigger');
    return trigger.expression;
  };

  it('opens a custom rule as one row per field, not as a cron text box', () => {
    open({ kind: 'cron', expression: '*/20 9-17 * * 1-5', timeZone: 'Asia/Shanghai' });
    // The raw expression box is the opt-in escape hatch, so it is not present.
    expect(byLabel(en['schedules.expression'])).toBeNull();
    for (const label of [
      en['schedules.cron.minute'],
      en['schedules.cron.hour'],
      en['schedules.cron.dayOfMonth'],
      en['schedules.cron.month'],
      en['schedules.cron.weekday'],
    ])
      expect(byLabel(`${label} rule`)).not.toBeNull();
    // Field modes reflect the stored rule.
    expect(byLabel(`${en['schedules.cron.minute']} rule`)!.textContent).toBe('Every N minutes');
    expect(byLabel(`${en['schedules.cron.hour']} rule`)!.textContent).toBe('Between');
    // A weekday range shows as day toggles rather than numbered boxes, so its
    // mode reads as the presentation on screen.
    expect(byLabel(`${en['schedules.cron.weekday']} rule`)!.textContent).toBe('On selected');
    expect(byLabel<HTMLButtonElement>('Monday')!.getAttribute('aria-pressed')).toBe('true');
    expect(byLabel<HTMLButtonElement>('Saturday')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('changes only the field that was edited', () => {
    open({ kind: 'cron', expression: '*/20 9-17 * * 1-5', timeZone: 'Asia/Shanghai' });
    setNumber(`Interval for ${en['schedules.cron.minute']}`, 5);
    submit();
    expect(savedExpression()).toBe('*/5 9-17 * * 1-5');

    setNumber(`${en['schedules.cron.hour']} range start`, 8);
    setNumber(`${en['schedules.cron.hour']} range end`, 20);
    submit();
    expect(savedExpression()).toBe('*/5 8-20 * * 1-5');
  });

  it('toggles weekdays without touching the rest of the rule', () => {
    open({ kind: 'cron', expression: '*/20 9-17 * * 1-5', timeZone: 'Asia/Shanghai' });
    // Saturday off→on; the stored `1-5` range becomes an explicit list.
    click(byLabel('Saturday'));
    submit();
    expect(savedExpression()).toBe('*/20 9-17 * * 1,2,3,4,5,6');
    click(byLabel('Monday'));
    submit();
    expect(savedExpression()).toBe('*/20 9-17 * * 2,3,4,5,6');
  });

  it('previews what the pickers built, in the rule’s own zone', () => {
    // Hour is a step inside a window, so it has both an interval and a range.
    open({ kind: 'cron', expression: '0 9-17/1 * * *', timeZone: 'UTC' });
    const preview = () => container.querySelector('[aria-live="polite"]')!.textContent!;
    expect(preview()).toContain(en['schedules.nextRuns']);
    expect(preview()).toContain('UTC');
    // 09:00 and 10:00 UTC today are still ahead of the fixed clock.
    expect(preview()).toContain('9:00 AM');
    expect(preview()).toContain('10:00 AM');
    setNumber(`Interval for ${en['schedules.cron.hour']}`, 4);
    // The window now steps 9, 13, 17 — the preview follows the pickers.
    expect(preview()).toContain('1:00 PM');
    expect(preview()).not.toContain('10:00 AM');
  });

  it('shows a field it cannot model in its own text box, and preserves it', () => {
    open({ kind: 'cron', expression: '*/15 9 * * MON#2', timeZone: 'Asia/Shanghai' });
    const raw = byLabel<HTMLInputElement>(`Custom text for ${en['schedules.cron.weekday']}`);
    expect(raw).not.toBeNull();
    expect(raw!.value).toBe('MON#2');
    // Editing a neighbouring field must not normalize the part we cannot name.
    setNumber(`Interval for ${en['schedules.cron.minute']}`, 10);
    expect(
      byLabel<HTMLInputElement>(`Custom text for ${en['schedules.cron.weekday']}`)!.value
    ).toBe('MON#2');
    // The rule is invalid for the persisted protocol, so saving stays blocked
    // with a visible reason rather than silently rewriting it.
    submit();
    expect(onSave).not.toHaveBeenCalled();
    setText(`Custom text for ${en['schedules.cron.weekday']}`, '2');
    submit();
    expect(savedExpression()).toBe('*/10 9 * * 2');
  });

  it('re-emits an untouched custom rule byte for byte', () => {
    const trigger = {
      kind: 'cron',
      expression: '0 9 * * MON-FRI',
      timeZone: 'Asia/Shanghai',
    } as const;
    // `MON-FRI` maps to the named "Every weekday" rule, so open a genuinely
    // custom one that also uses a spelling the pickers do not produce.
    const custom = {
      kind: 'cron',
      expression: '00 09 * * MON#2',
      timeZone: 'Asia/Shanghai',
    } as const;
    open(custom);
    expect(byLabel<HTMLInputElement>(`Custom text for ${en['schedules.cron.minute']}`)!.value).toBe(
      '00'
    );
    expect(byLabel<HTMLInputElement>(`Custom text for ${en['schedules.cron.hour']}`)!.value).toBe(
      '09'
    );
    setText(`Custom text for ${en['schedules.cron.weekday']}`, '1-5');
    submit();
    // Only the weekday changed; the `00`/`09` spelling survived untouched.
    expect(savedExpression()).toBe('00 09 * * 1-5');
    expect(trigger.expression).toBe('0 9 * * MON-FRI');
  });

  it('offers a text fallback that is opt-in, and returns to pickers', () => {
    open({ kind: 'cron', expression: '*/20 9-17 * * 1-5', timeZone: 'Asia/Shanghai' });
    const toggle = () =>
      [...container.querySelectorAll('button')].find(
        (button) =>
          button.textContent === en['schedules.cron.editAsText'] ||
          button.textContent === en['schedules.cron.usePickers']
      )!;
    expect(toggle().textContent).toBe(en['schedules.cron.editAsText']);
    click(toggle());
    expect(byLabel<HTMLInputElement>(en['schedules.expression'])!.value).toBe('*/20 9-17 * * 1-5');
    setText(en['schedules.expression'], '0 6 1 1 *');
    click(toggle());
    expect(byLabel(en['schedules.expression'])).toBeNull();
    expect(byLabel(`${en['schedules.cron.month']} rule`)!.textContent).toBe('On selected');
    submit();
    expect(savedExpression()).toBe('0 6 1 1 *');
  });
});

/**
 * The editor's state is the five fields, not a string it re-parses. These are
 * the three ways the previous derive-from-serialized-cron design broke.
 */
describe('Custom rule drafts survive editing', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSave: ReturnType<typeof vi.fn>;
  beforeAll(async () => {
    if (!i18next.isInitialized)
      await i18next
        .use(initReactI18next)
        .init({ lng: 'en', resources: { en: { translation: en } } });
  });
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onSave = vi.fn();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /** A fresh root per rule: `initial` seeds uncontrolled editor state. */
  const open = (expression: string) => {
    act(() => root.unmount());
    container.replaceChildren();
    root = createRoot(container);
    act(() =>
      root.render(
        <ScheduleForm
          now={NOW}
          saving={false}
          onSave={onSave}
          initial={{
            title: 'Build sweep',
            prompt: 'Check the build.',
            trigger: { kind: 'cron', expression, timeZone: 'Asia/Shanghai' },
            misfire: 'skip',
            overlap: 'skip',
          }}
        />
      )
    );
  };
  const byLabel = <T extends Element>(label: string) =>
    container.querySelector<T>(`[aria-label="${label}"]`);
  const click = (element: Element | null) =>
    act(() => {
      (element as HTMLElement).click();
    });
  const typeInto = (label: string, text: string) =>
    act(() => {
      const input = byLabel<HTMLInputElement>(label)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const submit = () =>
    act(() => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  const saveButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const fieldRows = () =>
    ['minute', 'hour', 'dayOfMonth', 'month', 'weekday'].filter((id) =>
      byLabel(`${en[`schedules.cron.${id}` as keyof typeof en]} rule`)
    );

  it('does not enumerate `*` when a field switches to a selection', () => {
    open('*/20 9-17 * * 1-5');
    // Emulate the mode change the Radix menu performs.
    const dayRule = byLabel<HTMLElement>(`${en['schedules.cron.dayOfMonth']} rule`)!;
    expect(dayRule.textContent).toBe('Every day');
    // Choosing "On selected" must leave the rule unfinished rather than
    // silently widening it to every date (day-of-month ORs with weekday).
    click(byLabel(`${en['schedules.cron.weekday']} rule`));
    // The weekday selection is emptied by unticking every day.
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) click(byLabel(day));
    expect(container.textContent).not.toContain('1,2,3');
  });

  it('keeps every picker on screen when the last selection is cleared', () => {
    open('*/20 9-17 * * 1-5');
    expect(fieldRows()).toHaveLength(5);
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) click(byLabel(day));

    // The previous design serialized this to `*/20 9-17 * * `, which failed to
    // parse and removed all five rows, leaving only a raw cron box.
    expect(fieldRows()).toHaveLength(5);
    expect(byLabel(en['schedules.expression'])).toBeNull();

    // Save is blocked, and the reason names the field.
    expect(saveButton().disabled).toBe(true);
    expect(container.textContent).toContain('Choose a value for');
    submit();
    expect(onSave).not.toHaveBeenCalled();

    // Choosing a day again restores a saveable rule, and the untouched fields
    // are exactly as they were.
    click(byLabel('Wednesday'));
    expect(saveButton().disabled).toBe(false);
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '*/20 9-17 * * 3',
      timeZone: 'Asia/Shanghai',
    });
  });

  it('keeps a field in Custom text while it is being typed', () => {
    open('0 9 * * MON#2');
    const rawLabel = `Custom text for ${en['schedules.cron.weekday']}`;
    expect(byLabel<HTMLInputElement>(rawLabel)!.value).toBe('MON#2');

    // Typing a value that happens to parse as a list must NOT swap the control
    // out from under the cursor; the person chose Custom text.
    typeInto(rawLabel, '2');
    const stillRaw = byLabel<HTMLInputElement>(rawLabel);
    expect(stillRaw).not.toBeNull();
    expect(stillRaw!.value).toBe('2');
    expect(byLabel<HTMLElement>(`${en['schedules.cron.weekday']} rule`)!.textContent).toBe(
      'Custom text'
    );

    // Emptying it is an incomplete draft, not a four-field expression.
    typeInto(rawLabel, '');
    expect(byLabel(rawLabel)).not.toBeNull();
    expect(saveButton().disabled).toBe(true);

    typeInto(rawLabel, '1-5');
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '0 9 * * 1-5',
      timeZone: 'Asia/Shanghai',
    });
  });

  it('explains that a date and a weekday combine with OR', () => {
    open('0 9 1 * 1-5');
    expect(container.textContent).toContain(en['schedules.cron.dayOrWeekdayHint']);
    open('0 9 * * 1,3');
    expect(container.textContent).not.toContain(en['schedules.cron.dayOrWeekdayHint']);
  });

  it('holds a half-typed whole expression instead of reverting it', () => {
    open('*/20 9-17 * * 1-5');
    const toggle = () =>
      [...container.querySelectorAll('button')].find(
        (button) =>
          button.textContent === en['schedules.cron.editAsText'] ||
          button.textContent === en['schedules.cron.usePickers']
      )!;
    click(toggle());
    const text = () => byLabel<HTMLInputElement>(en['schedules.expression'])!;
    expect(text().value).toBe('*/20 9-17 * * 1-5');

    // Mid-edit the string is not five fields. It must stay exactly as typed.
    typeInto(en['schedules.expression'], '0 9 * *');
    expect(text().value).toBe('0 9 * *');
    expect(saveButton().disabled).toBe(true);
    expect(toggle().disabled).toBe(true);

    typeInto(en['schedules.expression'], '0 9 * * 6');
    expect(toggle().disabled).toBe(false);
    click(toggle());
    expect(byLabel(en['schedules.expression'])).toBeNull();
    expect(fieldRows()).toHaveLength(5);
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '0 9 * * 6',
      timeZone: 'Asia/Shanghai',
    });
  });

  it('still re-emits an untouched rule byte for byte', () => {
    // `1-5,0` mixes a range and a list, which the pickers never emit. It stays
    // in its own text box, and an untouched rule is returned exactly as stored.
    open('*/20 9 * * 1-5,0');
    expect(
      byLabel<HTMLInputElement>(`Custom text for ${en['schedules.cron.weekday']}`)!.value
    ).toBe('1-5,0');
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '*/20 9 * * 1-5,0',
      timeZone: 'Asia/Shanghai',
    });
  });

  it('blocks saving a rule the persisted protocol rejects, without rewriting it', () => {
    // `MON#2` is croner syntax the schedule protocol refuses. It stays visible
    // and editable; what must not happen is a silent rewrite to something legal.
    open('0 9 * * MON#2');
    expect(
      byLabel<HTMLInputElement>(`Custom text for ${en['schedules.cron.weekday']}`)!.value
    ).toBe('MON#2');
    submit();
    expect(onSave).not.toHaveBeenCalled();
  });
});
