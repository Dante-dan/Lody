import { z } from 'zod';
import {
  SessionHistoryInputConfigSchema,
  MessageContentSchema,
  PlanEntrySchema,
} from './message-schemas';

/** New writes only. Never parse/rewrite the stored history through this schema. */
export const HistoryEntryWriteSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  timestamp: z.string(),
  userTurnId: z.string().optional(),
  acpTurnId: z.string().optional(),
  items: z.array(MessageContentSchema).optional(),
  plan: z.array(PlanEntrySchema).optional(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  permissionWaitMs: z.number().optional(),
  status: z
    .enum(['pending', 'pending_apply', 'seen', 'processing', 'handled', 'failed', 'canceled'])
    .optional(),
  inputConfig: SessionHistoryInputConfigSchema.optional(),
  read: z.boolean().optional(),
  userId: z.string().optional(),
  modelInfo: z
    .object({
      modelId: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
      _meta: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .optional(),
  fileDiff: z
    .array(
      z.object({
        filePath: z.string(),
        add: z.number(),
        del: z.number(),
        cc: z
          .object({
            v: z.literal(1),
            fileId: z.string(),
            opId: z
              .string()
              .regex(/^\d+:\d+$/)
              .optional(),
            baseOpId: z
              .string()
              .regex(/^\d+:\d+$/)
              .optional(),
            base: z.literal('missing').optional(),
            deleted: z.literal(true).optional(),
          })
          .optional(),
      })
    )
    .optional(),
  finished: z.boolean().optional(),
  sendStatus: z.literal('timeout').optional(),
});

export type HistoryEntryWrite = z.output<typeof HistoryEntryWriteSchema>;

/** Paths and codes only: never put conversation contents in validation errors. */
export class HistoryWriteError extends Error {
  constructor(readonly issues: readonly { path: readonly PropertyKey[]; code: string }[]) {
    super(
      `Invalid history write: ${issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`).join(', ')}`
    );
    this.name = 'HistoryWriteError';
  }
}

export function parseHistoryWrite<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(projectInput(schema, withoutTransportIds(value)));
  if (!result.success)
    throw new HistoryWriteError(result.error.issues.map(({ path, code }) => ({ path, code })));
  assertHistoryJson(result.data);
  return result.data;
}

// Reuse the business schemas' field definitions, but do not make their stricter
// external-RPC unknown-key policy a history rewrite policy. Closed objects select
// known input fields; explicit ACP extension dictionaries remain open.
function projectInput(schema: z.core.$ZodType, value: unknown): unknown {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return projectInput(schema.unwrap(), value);
  if (schema instanceof z.ZodUnion) {
    for (const option of schema.options) {
      const candidate = projectInput(option, value);
      if (z.safeParse(option, candidate).success) return candidate;
    }
    return value;
  }
  if (schema instanceof z.ZodArray && Array.isArray(value))
    return value.map((item) => projectInput(schema.element, item));
  if (
    schema instanceof z.ZodObject &&
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const catchall = schema.def.catchall;
    const open = catchall && !(catchall instanceof z.ZodNever);
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) => {
        const field = schema.shape[key];
        if (field) return [[key, projectInput(field, child)]];
        return open ? [[key, projectInput(catchall, child)]] : [];
      })
    );
  }
  return value;
}

// Mirror adds $cid to nested maps, including strict ACP objects. It is read-side
// container identity, not an input field; the materializer never persists it.
function withoutTransportIds(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new HistoryWriteError([{ path: [], code: 'non_json_value' }]);
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return value;
  ancestors.add(value);
  const result = Array.isArray(value)
    ? value.map((child) => withoutTransportIds(child, ancestors))
    : Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== '$cid')
          .map(([key, child]) => [key, withoutTransportIds(child, ancestors)])
      );
  ancestors.delete(value);
  return result;
}

// Provider-owned rawInput/rawOutput/_meta may have arbitrary JSON keys, not JS
// functions, class instances, cycles or non-finite values that fail halfway into Loro.
function assertHistoryJson(
  value: unknown,
  path: PropertyKey[] = [],
  ancestors = new Set<object>()
): void {
  if (
    value === undefined ||
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  )
    return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (
    typeof value !== 'object' ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new HistoryWriteError([{ path, code: 'non_json_value' }]);
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value))
    assertHistoryJson(child, [...path, key], ancestors);
  ancestors.delete(value);
}
