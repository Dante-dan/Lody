// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { DeferredOperationResults } from '../src/components/sessions/deferred-operation-results';
import { initI18n } from '../src/i18n';

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  flushSync(() => root?.unmount());
  root = undefined;
  container?.remove();
});

it('offers a single quiet summary with an opt-out and explicit processing action', async () => {
  await initI18n();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  let included = true;
  let processed = false;
  flushSync(() =>
    root?.render(
      <DeferredOperationResults
        count={5}
        included={included}
        onIncludedChange={(value) => {
          included = value;
        }}
        onProcess={() => {
          processed = true;
        }}
      />
    )
  );
  expect(container.textContent).toContain('5');
  const checkbox = container.querySelector<HTMLButtonElement>('[role="checkbox"]');
  expect(checkbox?.getAttribute('aria-checked')).toBe('true');
  flushSync(() => checkbox?.click());
  expect(included).toBe(false);
  const processButton = container.querySelector<HTMLButtonElement>('button:not([role="checkbox"])');
  flushSync(() => processButton?.click());
  expect(processed).toBe(true);
  flushSync(() =>
    root?.render(
      <DeferredOperationResults
        count={0}
        included
        onIncludedChange={() => {}}
        onProcess={() => {}}
      />
    )
  );
  expect(container.textContent).toBe('');
});
