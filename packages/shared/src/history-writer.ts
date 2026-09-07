import { Immer } from 'immer';
import { isContainer, LoroMap, type LoroDoc } from 'loro-crdt';
import { z } from 'zod';
import type { SessionHistory, SessionHistoryInput } from './schema';
import { sessionHistorySchema } from './schema';
import type { PermissionOutcome } from './message';
import { MessageContentSchema, PermissionOutcomeSchema } from './message-schemas';
import {
  HistoryEntryWriteSchema,
  HistoryWriteError,
  parseHistoryWrite,
} from './history-write-schema';
import { diffHistoryContainer, populateContainer } from './history-materializer';

const immer = new Immer({ autoFreeze: false, useStrictShallowCopy: true });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Ignore Mirror's transport identity, never the contents of a historical item. */
export function historyValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => historyValuesEqual(v, b[i]));
  if (!record(a) || !record(b)) return false;
  const ak = Object.keys(a).filter((k) => k !== '$cid' && a[k] !== undefined);
  const bk = Object.keys(b).filter((k) => k !== '$cid' && b[k] !== undefined);
  return (
    ak.length === bk.length &&
    ak.every((k) => Object.hasOwn(b, k) && historyValuesEqual(a[k], b[k]))
  );
}

/** New unknown keys are filtered; unknown keys already stored are never scrubbed. */
function preserveUnknown(
  schema: z.core.$ZodType,
  old: unknown,
  input: unknown,
  parsed: unknown
): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return preserveUnknown(schema.unwrap(), old, input, parsed);
  if (schema instanceof z.ZodUnion) {
    const option = schema.options.find((candidate) => z.safeParse(candidate, parsed).success);
    return option ? preserveUnknown(option, old, input, parsed) : parsed;
  }
  if (schema instanceof z.ZodObject && record(parsed)) {
    const result: Record<string, unknown> = Object.create(null);
    // Explicit protocol extension dictionaries (e.g. ACP content metadata) are
    // open in the shared parser. Respect that contract, not an invented whitelist.
    for (const key of Object.keys(parsed)) {
      if (key !== '$cid' && !Object.hasOwn(schema.shape, key)) result[key] = parsed[key];
    }
    if (record(old))
      for (const key of Object.keys(old)) {
        if (key !== '$cid' && !Object.hasOwn(schema.shape, key)) result[key] = old[key];
      }
    for (const [key, field] of Object.entries(schema.shape)) {
      if (!Object.hasOwn(parsed, key)) continue;
      result[key] = preserveUnknown(
        field as z.ZodType,
        record(old) ? old[key] : undefined,
        record(input) ? input[key] : undefined,
        parsed[key]
      );
    }
    return result;
  }
  if (schema instanceof z.ZodArray && Array.isArray(parsed))
    return parsed.map((value, i) =>
      preserveUnknown(
        schema.element,
        Array.isArray(old) ? old[i] : undefined,
        Array.isArray(input) ? input[i] : undefined,
        value
      )
    );
  return parsed;
}

const cleanNew = (schema: z.ZodType, input: unknown, old?: unknown): unknown =>
  preserveUnknown(schema, old, input, parseHistoryWrite(schema, input));

function prepareReplacement(previous: unknown, incoming: unknown): Record<string, unknown> {
  if (!record(previous) || !record(incoming))
    throw new HistoryWriteError([{ path: [], code: 'invalid_turn' }]);
  const result = { ...previous };
  for (const [key, schema] of Object.entries(HistoryEntryWriteSchema.shape)) {
    if (historyValuesEqual(previous[key], incoming[key])) continue;
    if (key === 'items' && Array.isArray(incoming.items)) {
      const oldItems = Array.isArray(previous.items) ? previous.items : [];
      // Retained items anchor each edited block, including an opaque item shifted
      // by deletion. Align replacements within the block, never across an anchor.
      let lastOld = -1;
      const anchors = incoming.items.map((item) => {
        const index = oldItems.findIndex((old, i) => i > lastOld && historyValuesEqual(old, item));
        if (index >= 0) lastOld = index;
        return index;
      });
      let oldStart = 0;
      let newStart = 0;
      result.items = incoming.items.map((item, i) => {
        const unchanged = anchors[i]!;
        if (unchanged >= 0) {
          oldStart = unchanged + 1;
          newStart = i + 1;
          return oldItems[unchanged];
        }
        const nextAnchor = anchors.slice(i + 1).find((index) => index >= 0) ?? oldItems.length;
        const oldIndex = oldStart + i - newStart;
        const old = oldIndex < nextAnchor ? oldItems[oldIndex] : undefined;
        return cleanNew(
          MessageContentSchema,
          item,
          record(old) && record(item) && old.type === item.type ? old : undefined
        );
      });
    } else {
      const value = cleanNew(schema, incoming[key], previous[key]);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
  }
  return result;
}

export interface HistoryWriter {
  append(entry: SessionHistory): void;
  replace(turnId: string, entry: SessionHistory): boolean;
  read(turnId: string): SessionHistory | undefined;
  /** Existing typed callback API; only its changed turns/items reach the writer. */
  update(updater: (history: SessionHistoryInput[]) => SessionHistoryInput[]): void;
  setField<K extends Exclude<keyof SessionHistoryInput, '$cid' | 'items' | 'id'>>(
    turnId: string,
    key: K,
    value: SessionHistoryInput[K] | undefined
  ): boolean;
  respondPermission(
    requestId: string,
    outcome: PermissionOutcome,
    options?: { turnId?: string }
  ): boolean;
}

/** Shared extraction of #376's writer. No ConversationView or feature-flag dependency. */
export function createHistoryWriter(doc: LoroDoc, readHistory?: () => readonly SessionHistory[]) {
  const list = doc.getList('history');
  const readAll = () => readHistory?.() ?? (list.toJSON() as SessionHistory[]);
  const locate = (id: string) => {
    for (let index = list.length - 1; index >= 0; index--) {
      const map = list.get(index);
      if (isContainer(map) && map.kind() === 'Map' && (map as LoroMap).get('id') === id)
        return map as LoroMap;
    }
    return undefined;
  };

  // Preparation is separate so a malformed update cannot leave half-written CRDT ops.
  const prepare = (previous: readonly SessionHistory[], next: readonly SessionHistory[]) => {
    const used = new Set<number>();
    const byId = new Map<unknown, number[]>();
    const byRef = new Map<unknown, number>();
    previous.forEach((entry, i) => {
      byRef.set(entry, i);
      const id = record(entry) ? entry.id : undefined;
      const matches = byId.get(id) ?? [];
      matches.push(i);
      byId.set(id, matches);
    });
    let last = -1;
    const plan = next.map((entry) => {
      const ref = byRef.get(entry);
      const candidates = byId.get(record(entry) ? entry.id : undefined) ?? [];
      const index =
        ref !== undefined && !used.has(ref) ? ref : candidates.find((i) => !used.has(i));
      if (index === undefined)
        return { value: cleanNew(HistoryEntryWriteSchema, entry), index: -1 };
      if (index < last)
        throw new HistoryWriteError([{ path: ['history'], code: 'unsupported_reorder' }]);
      last = index;
      used.add(index);
      const map = list.get(index);
      if (historyValuesEqual(previous[index], entry)) return { index, map };
      if (!isContainer(map) || map.kind() !== 'Map')
        throw new HistoryWriteError([{ path: ['history', index], code: 'invalid_stored_turn' }]);
      return { index, map, value: prepareReplacement(previous[index], entry) };
    });
    return () => {
      for (let i = previous.length - 1; i >= 0; i--) if (!used.has(i)) list.delete(i, 1);
      plan.forEach((op, i) => {
        if (op.index < 0)
          populateContainer(
            list.insertContainer(i, new LoroMap()),
            sessionHistorySchema,
            op.value,
            undefined
          );
        else if (op.value !== undefined && isContainer(op.map))
          diffHistoryContainer(
            op.map,
            sessionHistorySchema,
            previous[op.index],
            op.value,
            undefined
          );
      });
      doc.commit();
    };
  };

  const writer: HistoryWriter = {
    append(entry) {
      const value = cleanNew(HistoryEntryWriteSchema, entry);
      populateContainer(
        list.insertContainer(list.length, new LoroMap()),
        sessionHistorySchema,
        value,
        undefined
      );
      doc.commit();
    },
    replace(id, entry) {
      const map = locate(id);
      if (!map) return false;
      if (entry.id !== id) throw new HistoryWriteError([{ path: ['id'], code: 'immutable_id' }]);
      const previous = map.toJSON();
      const value = prepareReplacement(previous, entry);
      diffHistoryContainer(map, sessionHistorySchema, previous, value, undefined);
      doc.commit();
      return true;
    },
    read(id) {
      return locate(id)?.toJSON() as SessionHistory | undefined;
    },
    update(updater) {
      const previous = readAll();
      const next = immer.produce(previous as SessionHistoryInput[], (draft) => updater(draft));
      prepare(previous, next)();
    },
    setField(id, key, value) {
      const previous = writer.read(id);
      if (!previous) return false;
      return writer.replace(id, { ...previous, [key]: value });
    },
    respondPermission(requestId, outcome, options) {
      parseHistoryWrite(PermissionOutcomeSchema, outcome);
      const history = readAll();
      for (let i = history.length - 1; i >= 0; i--) {
        const turn = history[i];
        if (!turn || (options?.turnId && turn.id !== options.turnId) || !Array.isArray(turn.items))
          continue;
        const at = turn.items.findIndex(
          (item) => item?.type === 'tool_call' && item.permissionRequest?.requestId === requestId
        );
        if (at < 0) continue;
        const item = turn.items[at];
        if (item?.type !== 'tool_call' || !item.permissionRequest) continue;
        const items = [...turn.items];
        items[at] = { ...item, permissionRequest: { ...item.permissionRequest, outcome } };
        return writer.replace(turn.id, { ...turn, items });
      }
      return false;
    },
  };
  return { ...writer, prepare };
}
