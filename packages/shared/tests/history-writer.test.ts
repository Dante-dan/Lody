import { describe, expect, it } from 'vitest';
import { Loro, LoroList, LoroMap, LoroText } from 'loro-crdt';
import { Mirror } from 'loro-mirror';
import { createSessionMirror } from '../src/session-mirror';
import { sessionDocSchema, type SessionHistory } from '../src/schema';
import type { SessionId } from '../src/ids';
import type { StoredHistorySnapshot } from '../src/history-writer';

const id = 'synthetic-session' as SessionId;
const entry = (turnId = 'turn'): SessionHistory => ({
  id: turnId,
  role: 'user',
  timestamp: '2026-01-01T00:00:00Z',
  items: [{ type: 'text', text: 'hello' }],
  fileDiff: [],
});
const open = (doc: Loro) =>
  createSessionMirror({ doc, initialState: { session: { id }, history: [] } });

describe('single history writer', () => {
  it('copies opaque stored content without blessing new malformed input or changing the source', () => {
    const source = new Loro();
    const sourceMirror = open(source);
    const map = source.getList('history').insertContainer(0, new LoroMap());
    const stored = {
      ...entry(),
      futureTurn: { version: 3 },
      items: [
        { type: 'future_item', text: 42, payload: { nested: [null, 'opaque'] } },
        { type: 'text', text: 42, futureField: 'keep' },
        { type: 'text', text: 'valid', futureMetadata: { revision: 3 } },
      ],
    };
    for (const [key, value] of Object.entries(stored)) map.set(key, value);
    source.commit();
    const snapshot = sourceMirror.historyWriter.capture();
    const sourceVersion = source.version().toJSON();
    // A consumer cannot mutate the private baseline, even through its returned view.
    snapshot.history[0]!.items = [{ type: 'text', text: 'tampered' }];
    const target = new Loro();
    const targetMirror = open(target);
    const version = target.version().toJSON();
    expect(() =>
      targetMirror.historyWriter.copyFrom(
        { history: snapshot.history } as StoredHistorySnapshot,
        snapshot.history
      )
    ).toThrow('invalid_snapshot');
    const malformed = {
      ...entry('new'),
      items: [{ type: 'text', text: 42 }],
    } as unknown as SessionHistory;
    expect(() =>
      targetMirror.historyWriter.copyFrom(snapshot, [...snapshot.history, malformed])
    ).toThrow('Invalid history write');
    expect(() =>
      targetMirror.historyWriter.copyFrom(snapshot, [
        { ...snapshot.history[0]!, finished: 'bad' } as unknown as SessionHistory,
      ])
    ).toThrow('Invalid history write');
    expect(target.version().toJSON()).toEqual(version);
    targetMirror.historyWriter.copyFrom(snapshot, [
      { ...snapshot.history[0]!, read: true },
      entry('new'),
    ]);
    expect(target.getList('history').toJSON()[0]).toEqual({ ...stored, read: true });
    expect(source.getList('history').toJSON()).toEqual([stored]);
    expect(source.version().toJSON()).toEqual(sourceVersion);
    expect(() => targetMirror.historyWriter.copyFrom(snapshot, snapshot.history)).toThrow(
      'copy_target_not_empty'
    );
    const reopened = new Loro();
    reopened.import(target.export({ mode: 'snapshot' }));
    expect(reopened.getList('history').toJSON()).toEqual(target.getList('history').toJSON());
    targetMirror.historyWriter.replace('new', {
      ...entry('new'),
      items: [{ type: 'text', text: 'streamed' }],
    });
    expect(target.getList('history').toJSON()[0]).toEqual({ ...stored, read: true });
    sourceMirror.dispose();
    targetMirror.dispose();
  });

  it('restores deleted opaque history with a one-use receipt, refusing intervening peer edits', () => {
    const doc = new Loro();
    const mirror = open(doc);
    mirror.historyWriter.append(entry('prefix'));
    const old = doc.getList('history').insertContainer(1, new LoroMap());
    for (const [key, value] of Object.entries({
      ...entry('old'),
      items: [{ type: 'future_item', value: 42 }],
    }))
      old.set(key, value);
    doc.commit();
    const before = doc.getList('history').toJSON();
    const prefixId = (doc.getList('history').get(0) as LoroMap).id;
    const rollback = mirror.historyWriter.updateWithRollback((history) => [
      history[0]!,
      entry('replacement'),
    ]);
    rollback();
    expect(doc.getList('history').toJSON()).toEqual(before);
    expect((doc.getList('history').get(0) as LoroMap).id).toBe(prefixId);
    expect(() => rollback()).toThrow('stale_rollback');
    const stale = mirror.historyWriter.updateWithRollback((history) => [
      history[0]!,
      entry('replacement'),
    ]);
    const peer = new Loro();
    peer.import(doc.export({ mode: 'snapshot' }));
    const peerMirror = open(peer);
    peerMirror.historyWriter.append(entry('peer'));
    doc.import(peer.export({ mode: 'update', from: doc.version() }));
    const withPeer = doc.getList('history').toJSON();
    expect(() => stale()).toThrow('stale_rollback');
    expect(doc.getList('history').toJSON()).toEqual(withPeer);
    mirror.dispose();
    peerMirror.dispose();
  });

  it('checks fork-origin metadata before any write and preserves it on round trip', () => {
    const doc = new Loro();
    const mirror = open(doc);
    const notice = {
      type: 'system_notice' as const,
      name: 'session_fork_origin' as const,
      meta: {
        sourceSessionId: 'source' as SessionId,
        sourceTurnId: 'turn',
        sourceTitle: 'Synthetic',
      },
    };
    const version = doc.version().toJSON();
    for (const meta of [
      { sourceSessionId: 'source' },
      { ...notice.meta, sourceTitle: 42 },
      { message: 'wrong notice metadata' },
    ]) {
      expect(() =>
        mirror.historyWriter.append({
          ...entry(),
          items: [{ ...notice, meta }],
        } as unknown as SessionHistory)
      ).toThrow('Invalid history write');
      expect(doc.version().toJSON()).toEqual(version);
    }
    mirror.historyWriter.append({ ...entry(), role: 'system', items: [notice] });
    expect(doc.getList('history').toJSON()[0].items).toEqual([notice]);
    mirror.dispose();
  });

  it('keeps legacy primitive text primitive and retains it on an invalid item update', () => {
    const doc = new Loro();
    const mirror = open(doc);
    mirror.historyWriter.append(entry());
    const item = ((doc.getList('history').get(0) as LoroMap).get('items') as LoroList).get(
      0
    ) as LoroMap;
    item.set('text', 'legacy');
    doc.commit();
    mirror.historyWriter.replace('turn', {
      ...entry(),
      items: [{ type: 'text', text: 'streamed' }],
    });
    expect(item.get('text')).toBe('streamed');
    const version = doc.version().toJSON();
    expect(() =>
      mirror.historyWriter.replace('turn', {
        ...entry(),
        items: [{ type: 'text', text: 42 }],
      } as unknown as SessionHistory)
    ).toThrow('Invalid history write');
    expect(doc.version().toJSON()).toEqual(version);
    expect(item.get('text')).toBe('streamed');
    mirror.dispose();
  });

  it('accepts strict image objects read through Mirror and JSON list shape changes', () => {
    const doc = new Loro();
    const mirror = open(doc);
    mirror.historyWriter.append({
      ...entry(),
      items: [
        { type: 'image', imageId: 'image', mimeType: 'image/png', sizeBytes: 1 },
        {
          type: 'tool_call',
          toolCallId: 'tool',
          status: 'pending',
          rawInput: { values: [{ before: true }] },
        },
      ],
    });
    const imageMap = ((doc.getList('history').get(0) as LoroMap).get('items') as LoroList).get(
      0
    ) as LoroMap;
    imageMap.set('futureImageField', 7);
    doc.commit();
    mirror.setState((s) => {
      const image = s.history[0]!.items![0];
      if (image?.type === 'image') image.sizeBytes = 2;
      const tool = s.history[0]!.items![1];
      if (tool?.type === 'tool_call') tool.rawInput = { values: ['after'] };
    });
    expect(doc.toJSON().history[0].items[0].sizeBytes).toBe(2);
    expect(doc.toJSON().history[0].items[0].futureImageField).toBe(7);
    expect(doc.toJSON().history[0].items[1].rawInput.values).toEqual(['after']);
    mirror.dispose();
  });

  it('preserves a shifted opaque item and the following edited item containers', () => {
    const doc = new Loro();
    const mirror = open(doc);
    mirror.historyWriter.append({
      ...entry(),
      items: [
        { type: 'text', text: 'delete' },
        { type: 'text', text: 'opaque' },
        { type: 'text', text: 'tail' },
      ],
    });
    const items = (doc.getList('history').get(0) as LoroMap).get('items') as LoroList;
    const opaque = items.get(1) as LoroMap;
    opaque.set('type', 'future_item');
    opaque.set('future', 11);
    const tail = items.get(2) as LoroMap;
    tail.set('futureTail', 22);
    doc.commit();
    const body = tail.get('text') as LoroText;
    mirror.setState((s) => {
      s.history[0]!.items!.splice(0, 1);
      s.history[0]!.items![1] = { type: 'text', text: 'changed' };
    });
    expect((items.get(0) as LoroMap).id).toBe(opaque.id);
    expect((items.get(1) as LoroMap).id).toBe(tail.id);
    expect(tail.toJSON()).toMatchObject({ text: 'changed', futureTail: 22 });
    expect(doc.getContainerById(body.id)?.toJSON()).toBe('changed');
    mirror.dispose();
  });

  it('preflights a complete batch and does not publish control fields on invalid history', () => {
    const doc = new Loro();
    const mirror = open(doc);
    const version = doc.version().toJSON();
    expect(() =>
      mirror.setState((state) => {
        state.externalHistoryCursor = { importedTurnHashes: ['must-not-land'] };
        state.history.push(entry('good'));
        state.history.push({
          ...entry('bad'),
          items: [{ type: 'text' }],
        } as unknown as SessionHistory);
      })
    ).toThrow('Invalid history write');
    expect(doc.version().toJSON()).toEqual(version);
    expect(doc.toJSON().externalHistoryCursor.importedTurnHashes).toBeUndefined();
    mirror.historyWriter.append(entry('after-failure'));
    expect(doc.toJSON().history).toHaveLength(1);
    mirror.dispose();
  });

  it('rejects non-JSON payloads and malformed completion before attaching containers', () => {
    const doc = new Loro();
    const mirror = open(doc);
    const version = doc.version().toJSON();
    for (const item of [
      {
        type: 'tool_call',
        toolCallId: 'tool',
        status: 'pending',
        rawInput: { callback: () => {} },
      },
      {
        type: 'operation_completion',
        deliveryId: 'delivery',
        operationId: 'operation',
        operationKind: 'session_chat',
        completion: { type: 'result' },
      },
    ]) {
      expect(() =>
        mirror.historyWriter.append({ ...entry(), items: [item] } as unknown as SessionHistory)
      ).toThrow('Invalid history write');
      expect(doc.version().toJSON()).toEqual(version);
    }
    mirror.dispose();
  });

  it('keeps normal ACP permission and location fields and updates an outcome locally', () => {
    const doc = new Loro();
    const mirror = open(doc);
    const turn: SessionHistory = {
      ...entry(),
      role: 'assistant',
      items: [
        {
          type: 'tool_call',
          toolCallId: 'tool',
          status: 'pending',
          locations: [{ path: 'synthetic.ts', line: 3 }],
          permissionRequest: {
            requestId: 'request',
            options: [{ optionId: 'reject', name: 'Reject', kind: 'reject_always' }],
          },
        },
      ],
    };
    mirror.historyWriter.append(turn);
    const map = (doc.getList('history').get(0) as LoroMap).get('items') as LoroList;
    const itemId = (map.get(0) as LoroMap).id;
    expect(
      mirror.historyWriter.respondPermission('request', { outcome: 'selected', optionId: 'reject' })
    ).toBe(true);
    expect((map.get(0) as LoroMap).id).toBe(itemId);
    expect(doc.toJSON().history[0].items[0]).toMatchObject({
      locations: [{ path: 'synthetic.ts', line: 3 }],
      permissionRequest: { outcome: { outcome: 'selected', optionId: 'reject' } },
    });
    mirror.dispose();
  });
  it.each(['writer', 'callback'] as const)(
    'rejects malformed new items through %s before changing the doc',
    (path) => {
      const doc = new Loro();
      const mirror = open(doc);
      const version = doc.version().toJSON();
      const bad = { ...entry(), items: [{ type: 'text' }] } as unknown as SessionHistory;
      expect(() =>
        path === 'writer'
          ? mirror.historyWriter.append(bad)
          : mirror.setState((s) => {
              s.history.push(bad);
            })
      ).toThrow('Invalid history write');
      expect(doc.version().toJSON()).toEqual(version);
      expect(doc.getList('history').length).toBe(0);
      mirror.dispose();
    }
  );

  it('filters unknown new fields without allowing unknown new item types', () => {
    const doc = new Loro();
    const mirror = open(doc);
    const withExtras = {
      ...entry(),
      surprise: 'drop',
      items: [{ type: 'text', text: 'hello', mail: 'synthetic@example.invalid' }],
    } as SessionHistory;
    mirror.historyWriter.append(withExtras);
    expect(doc.toJSON().history[0]).toEqual(entry());
    const version = doc.version().toJSON();
    expect(() =>
      mirror.historyWriter.append({
        ...entry('future'),
        items: [{ type: 'future_item' }],
      } as unknown as SessionHistory)
    ).toThrow();
    expect(doc.version().toJSON()).toEqual(version);
    mirror.dispose();
  });

  it.each(['live import', 'snapshot reopen'] as const)(
    'keeps opaque and malformed history while appending, streaming and merging after %s',
    (mode) => {
      const peer = new Loro();
      peer.setPeerId('100');
      open(peer).dispose();
      const row = peer.getList('history').pushContainer(new LoroMap());
      row.set('id', 'old');
      row.set('role', 'assistant');
      row.set('timestamp', 'old');
      row.set('futureTurnField', 10);
      const items = row.setContainer('items', new LoroList());
      const future = items.pushContainer(new LoroMap());
      future.set('type', 'future_item');
      future.set('text', 42);
      const field = future.setContainer('payload', new LoroText());
      field.insert(0, 'before');
      const bad = items.pushContainer(new LoroMap());
      bad.set('type', 'text');
      const text = items.pushContainer(new LoroMap());
      text.set('type', 'text');
      const body = text.setContainer('text', new LoroText());
      body.insert(0, 'hello');
      text.set('futureItemField', 20);
      peer.commit();
      const doc = new Loro();
      doc.setPeerId('200');
      if (mode === 'snapshot reopen') doc.import(peer.export({ mode: 'snapshot' }));
      const before = doc.version().toJSON();
      const mirror = open(doc);
      if (mode === 'snapshot reopen') expect(doc.version().toJSON()).toEqual(before);
      else doc.import(peer.export({ mode: 'snapshot' }));
      const old = doc.toJSON().history[0];
      mirror.historyWriter.append(entry());
      expect(doc.toJSON().history[0]).toEqual(old);
      mirror.setState((s) => {
        s.history[0]!.items![2] = { type: 'text', text: 'streamed' };
      });
      expect(doc.getContainerById(body.id)?.toJSON()).toBe('streamed');
      expect(doc.toJSON().history[0].items[2].futureItemField).toBe(20);
      const version = doc.version().toJSON();
      expect(() =>
        mirror.historyWriter.setField('old', 'finished', 'bad' as unknown as boolean)
      ).toThrow();
      expect(doc.version().toJSON()).toEqual(version);
      mirror.historyWriter.setField('old', 'finished', true);
      field.update('concurrent');
      peer.commit();
      doc.import(peer.export({ mode: 'update', from: doc.version() }));
      peer.import(doc.export({ mode: 'update', from: peer.version() }));
      expect(doc.toJSON()).toEqual(peer.toJSON());
      expect(doc.getContainerById(future.id)?.toJSON()).toEqual({
        type: 'future_item',
        text: 42,
        payload: 'concurrent',
      });
      expect(doc.toJSON().history[0].items[1]).toEqual({ type: 'text' });
      mirror.dispose();
    }
  );

  it('retains turn and text container ids across scalar updates and list insertion/removal', () => {
    const doc = new Loro();
    const mirror = open(doc);
    mirror.historyWriter.append(entry('a'));
    mirror.historyWriter.append(entry('b'));
    const row = doc.getList('history').get(1) as LoroMap;
    const item = (row.get('items') as LoroList).get(0) as LoroMap;
    const body = item.get('text') as LoroText;
    mirror.historyWriter.update((history) => [entry('prefix'), ...history.slice(1)]);
    expect((doc.getList('history').get(1) as LoroMap).id).toBe(row.id);
    mirror.historyWriter.setField('b', 'finished', true);
    expect(doc.getContainerById(body.id)?.toJSON()).toBe('hello');
    expect(doc.toJSON().history.map((r: { id: string }) => r.id)).toEqual(['prefix', 'b']);
    mirror.dispose();
  });

  it('uses the same new storage shape as Mirror before #443', () => {
    const oldDoc = new Loro();
    const newDoc = new Loro();
    oldDoc.setPeerId('1');
    newDoc.setPeerId('1');
    const old = new Mirror({
      doc: oldDoc,
      schema: sessionDocSchema,
      ignoreUnknownProperties: true,
      initialState: { session: { id }, history: [] },
    });
    const current = open(newDoc);
    old.setState((s) => {
      s.history.push(entry());
    });
    current.historyWriter.append(entry());
    expect(newDoc.toJSON()).toEqual(oldDoc.toJSON());
    expect(newDoc.getList('history').toJSON()).toEqual(oldDoc.getList('history').toJSON());
    const ops = (doc: Loro) =>
      JSON.parse(
        JSON.stringify(doc.exportJsonUpdates(), (key, value) =>
          key === 'timestamp' ? undefined : value
        )
      );
    expect(ops(newDoc)).toEqual(ops(oldDoc));
    expect((newDoc.getList('history').get(0) as LoroMap).get('items')).toBeInstanceOf(LoroList);
    expect(
      ((newDoc.getList('history').get(0) as LoroMap).get('items') as LoroList).get(0)
    ).toBeInstanceOf(LoroMap);
    old.dispose();
    current.dispose();
  });
});
