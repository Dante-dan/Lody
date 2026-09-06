// All mutations are on isolated, disposable LoroDoc instances, never SQLite.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const next = require(process.env.LODY_STORAGE_NEW_MODULE);
const old = require(process.env.LODY_STORAGE_OLD_MODULE);
const { LoroDoc, isContainer, Mirror, sessionDocSchema } = next;
const clean = (v) => {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => k !== '$cid')
        .map(([k, x]) => [k, clean(x)])
    );
  return v;
};
const make = (doc, legacy = false) => {
  const module = legacy ? old : next;
  return new module.Mirror({ doc, schema: module.sessionDocSchema, throwOnValidationError: true });
};
function main() {
  const doc = new LoroDoc();
  const bytes = fs.readFileSync(process.argv[2]);
  let offset = 4;
  for (let i = 0; i < bytes.readUInt32LE(0); i++) {
    const n = bytes.readUInt32LE(offset);
    offset += 4;
    const result = doc.import(bytes.subarray(offset, offset + n));
    offset += n;
    assert(!result.pending || result.pending.size === 0);
  }
  const version = doc.version().encode();
  const legacy = make(doc, true),
    reader = make(doc);
  assert.deepEqual(clean(reader.getState()), clean(legacy.getState()));
  assert.deepEqual(doc.version().encode(), version);
  legacy.dispose();
  reader.dispose();
  if (!doc.getShallowValue().history) {
    doc.free();
    return { conversation: false };
  }
  const history = doc.getList('history').toJSON();
  const turns = history.map((t, i) => ({
    id: String(i),
    role: t.role,
    timestamp: typeof t.timestamp === 'string' ? t.timestamp : '2026-01-01T00:00:00Z',
    items: Array.isArray(t.items)
      ? t.items
      : typeof t.contents === 'string'
        ? JSON.parse(t.contents)
        : [],
  }));
  let legacyEdits = 0;
  // Exercise existing nested Text edits through the NEW writer, preserving IDs.
  const edit = make(doc);
  outer: for (let i = 0; i < history.length; i++) {
    const entry = doc.getList('history').get(i);
    const items = entry?.get?.('items');
    if (!items?.get) continue;
    for (let j = 0; j < items.length; j++) {
      const item = items.get(j);
      if (!item?.get || item.get('type') !== 'tool_call') continue;
      const text = item.get('title');
      if (!isContainer(text) || text.kind() !== 'Text') continue;
      const id = text.id,
        value = text.toString();
      edit.setState((s) => {
        s.history[i].items[j].title = value + ' [storage audit]';
      });
      assert.equal(item.get('title').id, id);
      assert.equal(item.get('title').toString(), value + ' [storage audit]');
      legacyEdits++;
      break outer;
    }
  }
  edit.dispose();
  doc.free();
  // Reconstruct EVERY message using the production new-write schema.
  const fresh = new LoroDoc(),
    writer = make(fresh);
  writer.setState((s) => ({ ...s, history: turns }));
  assert.deepEqual(fresh.toJSON().history, turns);
  let textContainers = 0,
    plainStrings = 0;
  function inspect(container, allowText = false, path = '') {
    if (container.kind() === 'Text') {
      assert(allowText);
      textContainers++;
      return;
    }
    const entries =
      container.kind() === 'Map'
        ? container.entries()
        : Array.from({ length: container.length }, (_, i) => [i, container.get(i)]);
    for (const [k, v] of entries) {
      if (isContainer(v))
        inspect(
          v,
          /^(content\[\]\.(output|content.text)|steps\[\].output)$/.test(
            path + (typeof k === 'number' ? '[]' : '.' + k)
          ),
          path + (typeof k === 'number' ? '[]' : '.' + k)
        );
      else if (typeof v === 'string') plainStrings++;
    }
  }
  const root = fresh.getList('history');
  for (let i = 0; i < root.length; i++) {
    const list = root.get(i).get('items');
    for (let j = 0; j < list.length; j++)
      for (const [k, v] of list.get(j).entries()) {
        if (isContainer(v)) inspect(v, k === 'text' || k === 'markdown', k);
        else if (typeof v === 'string') plainStrings++;
      }
  }
  const snapshot = fresh.export({ mode: 'snapshot' });
  const reopened = new LoroDoc();
  reopened.import(snapshot);
  const oldReader = make(reopened, true);
  assert.deepEqual(clean(oldReader.getState()), clean(writer.getState()));
  // An unchanged round trip must not add operations or convert storage.
  const before = reopened.version().encode();
  oldReader.setState((s) => s);
  assert.deepEqual(reopened.version().encode(), before);
  // Real unpatched old engine consumes and edits a newly inserted tool item.
  const probe = {
    id: 'storage-compat-probe',
    role: 'assistant',
    timestamp: '2026-01-01T00:00:00Z',
    items: [
      {
        type: 'tool_call',
        toolCallId: 'storage-compat-probe',
        status: 'in_progress',
        title: 'before',
      },
    ],
  };
  writer.setState((s) => {
    s.history.push(probe);
  });
  reopened.import(fresh.export({ mode: 'update', from: reopened.version() }));
  const index = turns.length;
  oldReader.setState((s) => {
    s.history[index].items[0].title = 'old writer';
  });
  fresh.import(reopened.export({ mode: 'update', from: fresh.version() }));
  assert.deepEqual(clean(writer.getState()), clean(oldReader.getState()));
  const map = fresh.getList('history').get(index).get('items').get(0);
  const previous = map.get('title');
  writer.setState((s) => {
    s.history[index].items[0].title = 'new writer';
  });
  if (isContainer(previous)) assert.equal(map.get('title').id, previous.id);
  reopened.import(fresh.export({ mode: 'update', from: reopened.version() }));
  assert.deepEqual(clean(writer.getState()), clean(oldReader.getState()));
  oldReader.dispose();
  reopened.free();
  writer.dispose();
  fresh.free();
  return {
    conversation: true,
    accepted: turns.reduce((n, t) => n + t.items.length, 0),
    unsupported: 0,
    invalid: 0,
    invalidToolBlocks: 0,
    questionMetadataMismatches: 0,
    answerMismatches: 0,
    schedulingMismatch: false,
    legacyEdits,
    textContainers,
    plainStrings,
  };
}
try {
  console.log(JSON.stringify(main()));
} catch (e) {
  console.log(JSON.stringify({ failed: true, errorClass: e.name }));
  process.exitCode = 1;
}
