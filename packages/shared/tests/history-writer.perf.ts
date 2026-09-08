// Synthetic diagnostic, not a timing assertion. Run: bun packages/shared/tests/history-writer.perf.ts
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { Loro } from 'loro-crdt';
import { Mirror } from 'loro-mirror';
import { createSessionMirror } from '../src/session-mirror';
import { createHistoryWriter } from '../src/history-writer';
import { sessionDocSchema, type SessionHistory } from '../src/schema';
import type { SessionId } from '../src/ids';

const turns = Number(process.env.HISTORY_BENCH_TURNS ?? 200);
const samples = Number(process.env.HISTORY_BENCH_SAMPLES ?? 3);
const fixture = (i: number): SessionHistory => ({
  id: `synthetic-${i}`,
  role: 'assistant',
  timestamp: '2026-01-01T00:00:00Z',
  items: Array.from({ length: 20 }, (_, j) => ({
    type: 'tool_call' as const,
    toolCallId: `tool-${i}-${j}`,
    status: 'in_progress' as const,
    content: [
      {
        type: 'content' as const,
        content: { type: 'text' as const, text: 'synthetic output '.repeat(20) },
      },
    ],
  })),
  fileDiff: [],
});
const entries = Array.from({ length: turns }, (_, i) => fixture(i));
let expectedHistory: unknown;
for (let sample = 0; sample < samples; sample++)
  for (const mode of ['mirror', 'writer'] as const) {
    const doc = new Loro();
    const initialState = { session: { id: 'synthetic-perf' as SessionId }, history: [] };
    const view =
      mode === 'writer'
        ? createSessionMirror({ doc, initialState })
        : new Mirror({
            doc,
            schema: sessionDocSchema,
            validateUpdates: false,
            ignoreUnknownProperties: true,
            initialState,
          });
    const writer = 'historyWriter' in view ? view.historyWriter : undefined;
    const measure = (operation: () => void, count = 1) => {
      const start = performance.now();
      for (let i = 0; i < count; i++) operation();
      return (performance.now() - start) / count;
    };
    const seed = measure(() =>
      view.setState((s) => {
        s.history = entries;
      })
    );
    const stream = measure(() => {
      const update = (history: SessionHistory[]) => {
        const tool = history[turns - 1]!.items![19]!;
        if (tool.type === 'tool_call') {
          const block = tool.content?.[0];
          if (block?.type === 'content' && block.content.type === 'text') block.content.text += 'x';
        }
        return history;
      };
      if (writer) writer.update(update);
      else
        view.setState((s) => {
          update(s.history);
        });
    }, 10);
    let flip = false;
    const field = measure(() => {
      flip = !flip;
      if (writer) writer.setField(`synthetic-${turns - 1}`, 'finished', flip);
      else
        view.setState((s) => {
          s.history[turns - 1]!.finished = flip;
        });
    }, 10);
    let next = turns;
    const append = measure(() => {
      const entry = fixture(next++);
      if (writer) writer.append(entry);
      else
        view.setState((s) => {
          s.history.push(entry);
        });
    }, 5);
    if (doc.getList('history').length !== turns + 5) throw new Error('incorrect history length');
    const history = doc.getList('history').toJSON();
    if (expectedHistory === undefined) expectedHistory = history;
    else assert.deepEqual(history, expectedHistory);
    console.log(JSON.stringify({ sample, mode, turns, seed, stream, field, append }));
    view.dispose();
  }

// Separately measure the field-write boundary with no reader subscriber.
for (let sample = 0; sample < samples; sample++) {
  const doc = new Loro();
  const writer = createHistoryWriter(doc);
  writer.append({
    id: 'large-synthetic',
    role: 'assistant',
    timestamp: 'synthetic',
    items: Array.from({ length: 20 }, (_, i) => ({
      type: 'tool_call' as const,
      toolCallId: String(i),
      status: 'completed' as const,
      rawOutput: { output: 'synthetic output '.repeat(2000) },
    })),
  });
  const start = performance.now();
  for (let i = 0; i < 100; i++) writer.setField('large-synthetic', 'finished', i % 2 === 0);
  console.log(
    JSON.stringify({ sample, mode: 'isolated-field', ms: (performance.now() - start) / 100 })
  );
}
