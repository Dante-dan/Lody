import { describe, expect, it } from 'vitest';
import { comparePinnedSessions, getSessionPinUpdate } from '../src/session-pin';
import type { SessionId } from '../src/schema';

describe('durable pin ordering reference contract', () => {
  it('keeps order through message activity and repeated pin requests, and moves a repin first', () => {
    const a = { id: 'a' as SessionId, ...getSessionPinUpdate({}, true, 10), lastMessageAt: 100 };
    const b = { id: 'b' as SessionId, ...getSessionPinUpdate({}, true, 20), lastMessageAt: 50 };
    const order = () => [a, b].sort(comparePinnedSessions).map((row) => row.id);
    expect(order()).toEqual(['b', 'a']);
    a.lastMessageAt = 1000;
    Object.assign(a, getSessionPinUpdate(a, true, 30));
    expect(order()).toEqual(['b', 'a']);
    Object.assign(a, getSessionPinUpdate(a, false, 40));
    Object.assign(a, getSessionPinUpdate(a, true, 50));
    expect(order()).toEqual(['a', 'b']);
  });

  it('orders legacy and invalid timestamps deterministically without a read migration', () => {
    const rows = [
      { id: 'z' as SessionId },
      { id: 'a' as SessionId, pinnedAt: Number.NaN },
      { id: 'new' as SessionId, pinnedAt: 0 },
    ];
    expect(rows.toSorted(comparePinnedSessions).map((row) => row.id)).toEqual(['new', 'a', 'z']);
    expect(rows[0]).toEqual({ id: 'z' });
  });
});
