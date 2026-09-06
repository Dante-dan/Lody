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

describe('Schedule save requirements', () => {
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
      selectors: null,
      saving: false,
      onSave: vi.fn(),
    };
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = () => act(() => root.render(<ScheduleForm {...props} />));
  const button = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const consent = () =>
    act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  const submit = () =>
    act(() => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  const requirements = () => container.querySelector('[aria-live="polite"]')!;

  it('explains consent and enables saving after consent', () => {
    render();
    expect(button().disabled).toBe(true);
    expect(requirements().textContent).toContain('Check the box above to allow automatic runs.');
    expect(button().getAttribute('aria-describedby')).toBe(requirements().id);
    consent();
    expect(button().disabled).toBe(false);
    expect(requirements().textContent).toBe('');
    submit();
    expect(props.onSave).toHaveBeenCalledWith(props.initial);
  });

  it('keeps permission and machine blockers visible after consent and guards submission', () => {
    props.saveBlockers = [en['schedules.choosePermission'], en['schedules.upgrade']];
    render();
    consent();
    submit();
    expect(requirements().textContent).toContain(en['schedules.choosePermission']);
    expect(requirements().textContent).toContain(en['schedules.upgrade']);
    expect(button().disabled).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
    props.saveBlockers = [];
    render();
    expect(button().disabled).toBe(false);
    expect(requirements().textContent).toBe('');
  });

  it('explains empty content and invalid time without requiring a submit', () => {
    props.initial = {
      ...props.initial,
      title: ' ',
      prompt: '',
      trigger: { kind: 'cron', expression: 'invalid', timeZone: 'Asia/Shanghai' },
    };
    render();
    consent();
    submit();
    for (const key of [
      'schedules.requireName',
      'schedules.requirePrompt',
      'schedules.invalidTime',
    ] as const)
      expect(requirements().textContent).toContain(en[key]);
    expect(button().disabled).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('does not resubmit while saving', () => {
    props.saving = true;
    render();
    consent();
    submit();
    expect(button().textContent).toBe('Saving…');
    expect(button().disabled).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
