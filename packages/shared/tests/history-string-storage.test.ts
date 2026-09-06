import { describe, expect, it } from 'vitest';
import { LoroDoc, LoroMap, LoroList, LoroText } from 'loro-crdt';
import { Mirror, schema } from 'loro-mirror';
import { sessionDocSchema } from '../src/schema';

// Preserve the previous schema's insertion policy for an actual old reader/writer.
const turn = sessionDocSchema.definition.history.itemSchema;
const item = turn.definition.items.itemSchema;
const legacySchema = schema({
  ...sessionDocSchema.definition,
  history: schema.LoroList(
    schema.LoroMap(
      {
        ...turn.definition,
        items: schema.LoroList(
          schema
            .LoroMap(item.definition, item.options)
            .catchall(schema.Any({ defaultLoroText: true })),
          undefined,
          { required: false }
        ),
      },
      turn.options
    ),
    (value) => value.id
  ),
});
const entry = (id: string) => ({
  id,
  role: 'assistant' as const,
  timestamp: '2026-01-01T00:00:00Z',
  items: [
    { type: 'text' as const, text: 'Hello 世界 🦀' },
    { type: 'thought' as const, text: 'Thinking' },
    {
      type: 'tool_call' as const,
      toolCallId: 'call-1',
      status: 'in_progress' as const,
      title: 'command',
      locations: [{ path: '/workspace/a.ts' }],
      content: [
        {
          type: 'terminal_command' as const,
          command: 'echo hello',
          args: ['hello'],
          cwd: '/workspace',
        },
      ],
    },
  ],
});
const create = (doc: LoroDoc, old = false) =>
  new Mirror({
    doc,
    schema: old ? legacySchema : sessionDocSchema,
    throwOnValidationError: true,
  });
const toolMap = (doc: LoroDoc, index = 0) =>
  ((doc.getList('history').get(index) as LoroMap).get('items') as LoroList).get(2) as LoroMap;
const clean = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => k !== '$cid')
        .map(([k, x]) => [k, clean(x)])
    );
  return v;
};

describe('history string storage compatibility', () => {
  it('creates plain metadata, nested strings and list strings while keeping streaming Text', () => {
    const doc = new LoroDoc();
    const mirror = create(doc);
    try {
      mirror.setState((s) => ({ ...s, history: [entry('new')] }));
      const items = (doc.getList('history').get(0) as LoroMap).get('items') as LoroList;
      expect((items.get(0) as LoroMap).get('text')).toBeInstanceOf(LoroText);
      expect((items.get(1) as LoroMap).get('text')).toBeInstanceOf(LoroText);
      const tool = toolMap(doc);
      expect(tool.get('toolCallId')).toBe('call-1');
      expect(tool.get('status')).toBe('in_progress');
      const command = (tool.get('content') as LoroList).get(0) as LoroMap;
      expect(command.get('command')).toBe('echo hello');
      expect(command.get('cwd')).toBe('/workspace');
      expect((command.get('args') as LoroList).get(0)).toBe('hello');
      const old = create(doc, true);
      expect(clean(old.getState())).toEqual(clean(mirror.getState()));
      old.dispose();
    } finally {
      mirror.dispose();
      doc.free();
    }
  });

  it('opens old snapshots without writes and preserves legacy Text IDs when editing', () => {
    const seed = new LoroDoc();
    const old = create(seed, true);
    old.setState((s) => ({ ...s, history: [entry('old')] }));
    const snapshot = seed.export({ mode: 'snapshot' });
    old.dispose();
    seed.free();
    const doc = new LoroDoc();
    doc.import(snapshot);
    const before = doc.version().encode();
    const legacyText = toolMap(doc).get('title') as LoroText;
    const mirror = create(doc);
    try {
      expect(doc.version().encode()).toEqual(before);
      mirror.setState((s) => {
        s.history[0]!.items[2]!.title = 'renamed';
      });
      expect((toolMap(doc).get('title') as LoroText).id).toBe(legacyText.id);
      expect((toolMap(doc).get('title') as LoroText).toString()).toBe('renamed');
      mirror.setState((s) => {
        s.history.push(entry('new'));
      });
      expect(toolMap(doc, 1).get('title')).toBe('command');
      const reader = create(doc, true);
      expect(clean(reader.getState())).toEqual(clean(mirror.getState()));
      reader.dispose();
    } finally {
      mirror.dispose();
      doc.free();
    }
  });

  it('exchanges updates with an old writer after reopening the mixed snapshot', () => {
    const a = new LoroDoc();
    const next = create(a);
    next.setState((s) => ({ ...s, history: [entry('new')] }));
    const b = new LoroDoc();
    b.import(a.export({ mode: 'snapshot' }));
    const old = create(b, true);
    try {
      const v = a.version();
      old.setState((s) => {
        s.history[0]!.items[2]!.title = 'old edit';
      });
      a.import(b.export({ mode: 'update', from: v }));
      expect(clean(next.getState())).toEqual(clean(old.getState()));
      next.setState((s) => {
        s.history[0]!.items[0]!.text += ' appended';
      });
      b.import(a.export({ mode: 'update', from: b.version() }));
      expect(clean(next.getState())).toEqual(clean(old.getState()));
      expect(toolMap(a).get('title')).toBe('old edit');
    } finally {
      next.dispose();
      old.dispose();
      a.free();
      b.free();
    }
  });
  it('merges concurrent edits into the same legacy Text instead of replacing it', () => {
    const a = new LoroDoc();
    const seed = create(a, true);
    seed.setState((s) => ({ ...s, history: [entry('old')] }));
    seed.dispose();
    const b = new LoroDoc();
    b.import(a.export({ mode: 'snapshot' }));
    const next = create(a);
    const oldText = toolMap(b).get('title') as LoroText;
    try {
      next.setState((s) => {
        s.history[0]!.items[2]!.title += ' A';
      });
      oldText.insert(oldText.length, ' B');
      a.import(b.export({ mode: 'update', from: a.version() }));
      b.import(a.export({ mode: 'update', from: b.version() }));
      const merged = toolMap(a).get('title') as LoroText;
      expect(merged.id).toBe(oldText.id);
      expect(merged.toString()).toContain(' A');
      expect(merged.toString()).toContain(' B');
      expect(a.toJSON()).toEqual(b.toJSON());
    } finally {
      next.dispose();
      a.free();
      b.free();
    }
  });
  it('keeps streamed tool and script outputs as Text but their metadata as primitives', () => {
    const doc = new LoroDoc();
    const mirror = create(doc);
    try {
      mirror.setState((state) => ({
        ...state,
        history: [
          {
            id: 'stream',
            role: 'assistant',
            timestamp: '2026-01-01T00:00:00Z',
            items: [
              {
                type: 'tool_call',
                toolCallId: 'call',
                status: 'in_progress',
                content: [
                  { type: 'terminal_output', output: 'first', stream: 'stdout' },
                  { type: 'content', content: { type: 'text', text: 'first' } },
                ],
              },
              {
                type: 'worktree_script',
                phase: 'setup',
                status: 'in_progress',
                steps: [{ command: 'setup', status: 'in_progress', output: 'first' }],
              },
            ],
          },
        ],
      }));
      const items = (doc.getList('history').get(0) as LoroMap).get('items') as LoroList;
      const tool = items.get(0) as LoroMap;
      const blocks = tool.get('content') as LoroList;
      const terminal = blocks.get(0) as LoroMap;
      const text = (blocks.get(1) as LoroMap).get('content') as LoroMap;
      const step = ((items.get(1) as LoroMap).get('steps') as LoroList).get(0) as LoroMap;
      const output = terminal.get('output') as LoroText;
      expect(output).toBeInstanceOf(LoroText);
      expect(text.get('text')).toBeInstanceOf(LoroText);
      expect(step.get('output')).toBeInstanceOf(LoroText);
      expect(terminal.get('stream')).toBe('stdout');
      expect(step.get('command')).toBe('setup');
      mirror.setState((s) => {
        s.history[0]!.items[0]!.content![0]!.output = 'first second';
      });
      expect((terminal.get('output') as LoroText).id).toBe(output.id);
      expect(output.toString()).toBe('first second');
    } finally {
      mirror.dispose();
      doc.free();
    }
  });
  it('does not convert a legacy primitive into Text when the field is now explicitly streaming', () => {
    const doc = new LoroDoc();
    const seed = create(doc);
    seed.setState((s) => ({ ...s, history: [entry('old-plain')] }));
    seed.dispose();
    const textItem = ((doc.getList('history').get(0) as LoroMap).get('items') as LoroList).get(
      0
    ) as LoroMap;
    textItem.set('text', 'legacy primitive');
    doc.commit();
    const mirror = create(doc);
    try {
      mirror.setState((s) => {
        s.history[0]!.items[0]!.text = 'legacy primitive appended';
      });
      expect(textItem.get('text')).toBe('legacy primitive appended');
    } finally {
      mirror.dispose();
      doc.free();
    }
  });
});
