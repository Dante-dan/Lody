// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionShareManager,
  type SessionShareManagerProps,
} from '../src/components/sharing/session-share-manager';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('session share management surface', () => {
  let root: Root;
  let container: HTMLDivElement;
  let props: SessionShareManagerProps;
  const entry = {
    title: 'Root',
    shareId: 'share',
    rootSessionId: 'root',
    authorUserId: 'alice',
    status: 'active' as const,
    scopeVersion: 1,
    credentialVersion: 1,
    sessionIds: ['root'],
    readableSessionIds: ['root'],
    validUntil: 200,
    canManage: true,
    canRevoke: true,
  };
  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    props = {
      sessionId: 'root',
      state: {
        root: entry,
        sources: [entry],
        candidates: [
          { sessionId: 'root', title: 'Root', available: true, validUntil: 200 },
          { sessionId: 'child', title: 'Child', available: true, validUntil: 200 },
          { sessionId: 'local', title: 'Local', available: false, validUntil: null },
        ],
      },
      candidates: [
        { sessionId: 'root', title: 'Root' },
        { sessionId: 'child', title: 'Child' },
        { sessionId: 'local', title: 'Local' },
      ],
      selected: ['root'],
      copyableShareIds: ['share'],
      now: 100,
      busy: false,
      conflict: false,
      error: null,
      notice: null,
      onSelect: vi.fn(),
      onReload: vi.fn(),
      onCreate: vi.fn(),
      onSave: vi.fn(),
      onReset: vi.fn(),
      onCopy: vi.fn(),
      onRevoke: vi.fn(),
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  async function render() {
    await act(async () => root.render(<SessionShareManager {...props} />));
  }
  function button(label: string) {
    return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent === label
    );
  }
  async function click(node: HTMLElement | undefined | null) {
    expect(node).toBeTruthy();
    await act(async () => node?.click());
  }
  const acknowledge = () =>
    click(container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]')[3]);

  it('requires explicit selection and disclosure acknowledgement, and rejects unavailable candidates', async () => {
    props.state = { ...props.state!, root: null, sources: [] };
    await render();
    const boxes = container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]');
    expect(boxes[0]?.disabled).toBe(true);
    expect(boxes[1]?.getAttribute('aria-checked')).toBe('false');
    expect(boxes[2]?.disabled).toBe(true);
    expect(button('Create share link')?.disabled).toBe(true);
    await click(boxes[1]);
    expect(props.onSelect).toHaveBeenCalledWith(['root', 'child']);
    await acknowledge();
    expect(button('Create share link')?.disabled).toBe(false);
    await click(button('Create share link'));
    expect(props.onCreate).toHaveBeenCalledOnce();
  });

  it('requires reset on a device without the secret and invalidates an open reset confirmation after a concurrent change', async () => {
    props.copyableShareIds = [];
    props.selected = ['root', 'child'];
    await render();
    expect(button('Copy share link')).toBeUndefined();
    await acknowledge();
    expect(button('Save selection')?.disabled).toBe(true);
    await click(button('Reset link'));
    props.state = { ...props.state!, root: { ...entry, credentialVersion: 2 } };
    await render();
    expect(button('Confirm')?.disabled).toBe(true);
    await click(button('Confirm'));
    expect(props.onReset).not.toHaveBeenCalled();
  });

  it('offers administrators revocation without author actions and confirms the exact independent grant', async () => {
    props.state = { ...props.state!, root: { ...entry, canManage: false } };
    props.copyableShareIds = [];
    await render();
    expect(button('Reset link')).toBeUndefined();
    expect(button('Save selection')).toBeUndefined();
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    await click(button('Revoke link'));
    expect(props.onRevoke).not.toHaveBeenCalled();
    await click(button('Confirm'));
    expect(props.onRevoke).toHaveBeenCalledWith(props.state.root);
  });

  it('explains the unavailable badge once, and only while a candidate is actually ineligible', async () => {
    await render();
    expect(container.textContent).toContain('Not ready: needs cloud sync and author verification.');
    // One shared explanation, not one repeated under every row.
    expect(container.textContent!.split('needs cloud sync').length - 1).toBe(1);
    props.state = {
      ...props.state!,
      candidates: props.state!.candidates.map((candidate) => ({
        ...candidate,
        available: true,
        validUntil: 200,
      })),
    };
    await render();
    expect(container.textContent).not.toContain('needs cloud sync');
  });

  it('freezes target selection while a mutation is in flight but keeps the candidate filter usable', async () => {
    props.filter = <input aria-label="Find related conversations" />;
    props.busy = true;
    await render();
    for (const box of container.querySelectorAll<HTMLButtonElement>('[role="checkbox"]'))
      expect(box.disabled).toBe(true);
    const filter = container.querySelector<HTMLInputElement>(
      'input[aria-label="Find related conversations"]'
    );
    expect(filter).toBeTruthy();
    expect(filter?.disabled).toBe(false);
  });

  it('stops presenting an expired grant as active without a new server record', async () => {
    props.now = 201;
    await render();
    expect(container.textContent).toContain('Link is currently unavailable');
    expect(button('Copy share link')).toBeUndefined();
    await acknowledge();
    expect(button('Reset link')?.disabled).toBe(true);
  });
});
