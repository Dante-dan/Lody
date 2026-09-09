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
    await i18next.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
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
      await i18next.use(initReactI18next).init({
        lng: 'en',
        resources: { en: { translation: en } },
        interpolation: { escapeValue: false },
      });
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
      [
        { kind: 'cron', expression: '*/15 * * * *', timeZone: 'UTC' },
        en['schedules.repeat.minutes'],
      ],
      [{ kind: 'cron', expression: '0 */6 * * *', timeZone: 'UTC' }, en['schedules.repeat.hours']],
      [{ kind: 'once', at: '2026-09-07T01:00:00.000Z' }, en['schedules.repeat.once']],
      [
        { kind: 'interval', everyMs: 7 * 60_000, anchorAt: '2026-09-06T00:00:00.000Z' },
        en['schedules.repeat.minutes'],
      ],
    ];
    for (const [trigger, label] of cases) {
      open(trigger);
      expect(repeatValue()).toBe(label);
    }
  });

  it('shows a rule it cannot name read-only, and re-emits it byte for byte', () => {
    const trigger = {
      kind: 'cron',
      expression: '*/20 9-17 * * 1-5',
      timeZone: 'Asia/Shanghai',
    } as const;
    open(trigger);
    // No cron text box anywhere, and no picker either: only the summary and
    // a Replace action.
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(container.querySelector(`[aria-label="${en['schedules.repeat.label']}"]`)).toBeNull();
    expect(container.textContent).toContain('*/20 9-17 * * 1-5');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === en['schedules.repeat.replace']
      )
    ).toBe(true);
    submit();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0].trigger).toEqual(trigger);
  });

  it('replaces an unsupported rule with a named one only on request', () => {
    open({ kind: 'cron', expression: '*/20 9-17 * * 1-5', timeZone: 'Asia/Shanghai' });
    act(() => {
      [...container.querySelectorAll('button')]
        .find((button) => button.textContent === en['schedules.repeat.replace'])!
        .click();
    });
    expect(repeatValue()).toBe(en['schedules.repeat.daily']);
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '0 9 * * *',
      timeZone: 'Asia/Shanghai',
    });
  });

  it('opens a manual task without a time rule, and saves it as manual', () => {
    open({ kind: 'manual' });
    expect(container.querySelector(`[aria-label="${en['schedules.repeat.label']}"]`)).toBeNull();
    expect(container.textContent).toContain(en['schedules.trigger.manualHelp']);
    expect(container.textContent).not.toContain(en['schedules.nextRuns']);
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({ kind: 'manual' });
  });

  it('switches between manual and timed without losing the time rule', () => {
    open({ kind: 'cron', expression: '30 7 * * 1-5', timeZone: 'Asia/Shanghai' });
    const radio = (name: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
        (button) => button.textContent === name
      )!;
    act(() => radio(en['schedules.trigger.manual']).click());
    expect(container.textContent).toContain(en['schedules.trigger.manualHelp']);
    act(() => radio(en['schedules.trigger.timed']).click());
    expect(repeatValue()).toBe(en['schedules.repeat.weekdays']);
    submit();
    // Untouched, so the stored spelling comes back exactly.
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '30 7 * * 1-5',
      timeZone: 'Asia/Shanghai',
    });
  });

  it('opens a day-of-month list as a monthly rule with those days pressed', () => {
    open({ kind: 'cron', expression: '0 9 1,15 * *', timeZone: 'Asia/Shanghai' });
    expect(repeatValue()).toBe(en['schedules.repeat.monthly']);
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')].map(
      (el) => el.textContent
    );
    expect(pressed).toEqual(['1', '15']);
    // Toggle the 28th on; only that field changes.
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Day 28"]')!.click());
    submit();
    expect(onSave.mock.calls[0]![0].trigger).toEqual({
      kind: 'cron',
      expression: '0 9 1,15,28 * *',
      timeZone: 'Asia/Shanghai',
    });
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
