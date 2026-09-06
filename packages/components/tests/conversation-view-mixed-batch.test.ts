import { describe, expect, it } from 'vitest';
import { LoroMap, type LoroList } from 'loro-crdt';
import { createConversationViewFromDoc } from '../src/lib/conversation-view';
import {
  buildFixtureHistory,
  buildSessionDoc,
  createManualIdle,
  FIXTURE_SESSION_ID,
} from './conversation-view-fixtures';

describe('index scalars after a structural batch', () => {
  it.each([false, true])(
    'replaces all scalars when a deferred turn is hydrated (delete=%s)',
    (remove) => {
      const history = buildFixtureHistory(30).map((turn) => ({
        ...turn,
        items:
          turn.role === 'assistant'
            ? Array.from({ length: 40 }, (_, i) => ({ type: 'text' as const, text: `item ${i}` }))
            : turn.items,
      }));
      const doc = buildSessionDoc(history);
      const idle = createManualIdle();
      const view = createConversationViewFromDoc(doc, {
        sessionId: FIXTURE_SESSION_ID,
        scheduleIdle: idle.scheduleIdle,
      });
      // Use production budgets: a heavy tail cannot all be loaded on open.
      const target = Array.from({ length: 20 }, (_, i) => view.turnCount - 20 + i).find(
        (i) => !view.isHydrated(i) && view.index(i)?.role === 'assistant'
      )!;
      expect(target).toBeGreaterThanOrEqual(0);
      const list = doc.getList('history') as LoroList;
      const turn = list.get(target) as LoroMap;
      if (remove) {
        turn.delete('finished');
        turn.delete('endedAt');
      } else {
        turn.set('finished', false);
        turn.set('endedAt', 123);
      }
      turn.set('status', 'pending');
      const next = list.insertContainer(list.length, new LoroMap());
      next.set('id', 'next');
      next.set('role', 'user');
      next.set('timestamp', '2026-01-01T00:00:00.000Z');
      doc.commit();
      const assertCurrent = () => {
        expect(view.turn(target)?.status).toBe('pending');
        expect(view.index(target)?.status).toBe('pending');
        expect(view.index(target)?.finished).toBe(remove ? undefined : false);
        expect(view.index(target)?.endedAt).toBe(remove ? undefined : 123);
      };
      assertCurrent();
      doc.getMap('session').set('title', 'unrelated');
      doc.commit();
      idle.runAll();
      assertCurrent();
      view.dispose();
    }
  );
});
