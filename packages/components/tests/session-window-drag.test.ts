// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionMentionDrag,
  getInFlightSessionMentionDragId,
  startSessionMentionDrag,
} from '../src/lib/session-mention-drag';
import { createSessionMentionTransfer } from './helpers/session-mention-transfer';

const state = vi.hoisted(() => ({ outcomes: [] as { sessionId: string; released: boolean }[] }));
vi.mock('../src/lib/session-window-actions', () => ({
  beginSessionWindowDrag: (sessionId: string) => (released: boolean) => {
    state.outcomes.push({ sessionId, released });
  },
}));

function start(sessionId: string, detach = true) {
  const transfer = { ...createSessionMentionTransfer(), setDragImage: () => {} };
  startSessionMentionDrag({ dataTransfer: transfer }, { sessionId, title: sessionId, detach });
}

function end(dropEffect = 'none', screenX = 500, screenY = 500) {
  const event = new Event('dragend');
  Object.defineProperties(event, {
    dataTransfer: { value: { dropEffect } },
    screenX: { value: screenX },
    screenY: { value: screenY },
  });
  window.dispatchEvent(event);
}

afterEach(() => {
  clearSessionMentionDrag();
  state.outcomes.length = 0;
});

describe('Session detach lifecycle', () => {
  it('clears cancellation between consecutive drags and consumes each completion once', () => {
    start('cancelled');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    end();
    expect(getInFlightSessionMentionDragId()).toBeNull();
    start('accepted');
    end('copy');
    start('outside');
    end();
    end();
    expect(state.outcomes).toEqual([
      { sessionId: 'cancelled', released: false },
      { sessionId: 'accepted', released: false },
      { sessionId: 'outside', released: true },
    ]);
    expect(document.body.children).toHaveLength(0);
  });

  it('releases a superseded token and preview, including when the next drag is mention-only', () => {
    start('old');
    start('replacement');
    expect(document.body.children).toHaveLength(1);
    start('mention', false);
    expect(document.body.children).toHaveLength(0);
    expect(getInFlightSessionMentionDragId()).toBe('mention');
    end();
    expect(state.outcomes).toEqual([
      { sessionId: 'old', released: false },
      { sessionId: 'replacement', released: false },
    ]);
    expect(getInFlightSessionMentionDragId()).toBeNull();
  });

  it('does not detach a zero-coordinate cancellation or a cleared drag', () => {
    start('zero');
    end('none', 0, 0);
    start('cleared');
    clearSessionMentionDrag();
    end();
    expect(state.outcomes).toEqual([
      { sessionId: 'zero', released: false },
      { sessionId: 'cleared', released: false },
    ]);
  });
});
