import { z } from 'zod';

/**
 * Candidate write contract for history items. Every object is closed: Zod's
 * default object parsing strips undeclared keys. Unknown list variants are
 * skipped independently, so they cannot reject neighboring supported items.
 * This is deliberately separate from the transport schemas and is not yet
 * wired into production writes: corpus validation must precede that change.
 */
const strings = <K extends string>(...keys: K[]) =>
  Object.fromEntries(keys.map((key) => [key, z.string().nullish()])) as {
    [P in K]: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  };
const numbers = <K extends string>(...keys: K[]) =>
  Object.fromEntries(keys.map((key) => [key, z.number().nullish()])) as {
    [P in K]: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  };
const flags = <K extends string>(...keys: K[]) =>
  Object.fromEntries(keys.map((key) => [key, z.boolean().nullish()])) as {
    [P in K]: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
  };
const optionalObject = (shape: z.ZodRawShape) => z.object(shape).nullish();
const supportedArray = <S extends z.ZodType>(item: S) =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value.flatMap((entry: unknown) => {
            const parsed = item.safeParse(entry);
            return parsed.success ? [parsed.data] : [];
          })
        : value,
    z.array(item)
  );
const imageFields = {
  imageId: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  ...strings('fileName', 'storageSessionId'),
  ...numbers('width', 'height'),
};
const exitStatus = optionalObject({ ...numbers('exitCode'), ...strings('signal') });
const rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const actor = optionalObject({ kind: z.string(), ...strings('agentConfigId', 'name') });
const error = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
});
const target = z.object({ sessionId: z.string(), userTurnId: z.string() });
const operationResult = z.object({
  items: z.array(
    z.object({
      status: z.string(),
      ...strings('label', 'assistantTurnId'),
      target: target.optional(),
      inputDurable: z.boolean().optional(),
      error: error.optional(),
      output: optionalObject({
        text: z.string(),
        ...flags('truncated'),
        ...numbers('omittedBytes'),
      }),
    })
  ),
});
const completion = z.object({
  type: z.string(),
  value: operationResult.optional(),
  partial: operationResult.optional(),
  error: error.optional(),
  truncation: optionalObject({ truncated: z.boolean(), omittedBytes: z.number() }),
});

/** JSON tool-image wrappers observed in local history are text, not renderable images. */
export function removeSerializedToolImages(text: string): string {
  if (!text.includes('data:image/') || text.length > 10_000_000) return text;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text;
  }
  if (!Array.isArray(value)) return text;
  const result = value.filter((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('imageUrl' in entry)) return true;
    const image = entry.imageUrl;
    return !(
      image &&
      typeof image === 'object' &&
      'url' in image &&
      typeof image.url === 'string' &&
      image.url.startsWith('data:image/')
    );
  });
  return result.length === value.length ? text : result.length ? JSON.stringify(result) : '';
}

const standardToolContent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().transform(removeSerializedToolImages) }),
  // Structured image/audio blocks do have renderers. Keep them distinct from
  // imageUrl wrappers hidden inside JSON text; externalizing them is separate.
  z
    .object({
      type: z.literal('image'),
      mimeType: z.string(),
      ...strings('uri', 'data'),
    })
    .refine((value) => typeof value.uri === 'string' || typeof value.data === 'string'),
  z.object({ type: z.literal('audio'), mimeType: z.string(), data: z.string() }),
  z.object({
    type: z.literal('resource_link'),
    uri: z.string(),
    name: z.string(),
    ...strings('title', 'description', 'mimeType'),
    ...numbers('size'),
  }),
  z.object({
    type: z.literal('resource'),
    resource: z.object({ uri: z.string(), ...strings('text', 'mimeType') }),
  }),
]);
export const historyToolContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content'), content: standardToolContent }),
  z.object({ type: z.literal('terminal'), terminalId: z.string() }),
  z.object({
    type: z.literal('terminal_command'),
    command: z.string(),
    args: z.array(z.string()).nullish(),
    ...strings('cwd'),
  }),
  // Diff evidence has a separate consumer; this schema does not remove it implicitly.
  z.object({
    type: z.literal('diff'),
    path: z.string(),
    ...strings('oldText'),
    newText: z.string(),
  }),
]);
const schedulingInput = optionalObject({
  ...strings('cron', 'prompt', 'id', 'jobId', 'taskId', 'description', 'message', 'reason'),
  ...numbers('delaySeconds'),
  ...flags('recurring'),
});
const schedulingOutput = optionalObject({
  ...strings('id', 'jobId', 'taskId'),
  jobs: z.array(z.object({ ...strings('id', 'cron', 'prompt'), ...flags('recurring') })).optional(),
});
// These are named dictionaries of question answers, not arbitrary provider metadata.
const answers = z
  .record(
    z.string(),
    z.union([z.string(), z.array(z.string()), z.object({ answers: z.array(z.string()) })])
  )
  .optional();
const question = z.object({
  ...strings('id'),
  question: z.string(),
  header: z.string(),
  ...flags('multiSelect', 'allowCustomAnswer', 'isSecret', 'is_secret', 'isOther', 'is_other'),
  options: z
    .array(z.object({ label: z.string(), ...strings('description', 'preview') }))
    .optional(),
});
const questionMeta = optionalObject({
  ...numbers('version', 'autoResolveAt', 'autoResolveAtEpochSeconds'),
  ...flags('allowCustomAnswer'),
  questions: z.array(question).optional(),
  answers,
});
const permissionMeta = optionalObject({
  claudeCode: optionalObject({ ...strings('requestType'), askUserQuestion: questionMeta }),
  codex: optionalObject({
    ...strings('requestType', 'decision'),
    execpolicyAmendment: z.array(z.string()).optional(),
    requestUserInput: questionMeta,
  }),
  lody: optionalObject({ elicitation: questionMeta }),
});
const variants = {
  text: z.object({
    type: z.literal('text'),
    text: z.string(),
    spans: z
      .array(
        z.object({
          start: z.number(),
          end: z.number(),
          kind: z.string(),
          label: z.string(),
          ...strings('target'),
        })
      )
      .optional(),
  }),
  thought: z.object({ type: z.literal('thought'), text: z.string() }),
  image: z.object({ type: z.literal('image'), ...imageFields }),
  image_group: z.object({ type: z.literal('image_group'), images: z.array(z.object(imageFields)) }),
  file: z.object({
    type: z.literal('file'),
    fileId: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    sha256: z.string(),
    textPreview: z.boolean(),
    transport: z.string(),
    uploadedAt: z.number(),
    ...strings('sourcePath', 'machineId', 'storageSessionId'),
  }),
  plan: z.object({
    type: z.literal('plan'),
    entries: z.array(z.object({ content: z.string(), status: z.string(), ...strings('priority') })),
  }),
  proposed_plan: z.object({
    type: z.literal('proposed_plan'),
    turnId: z.string(),
    markdown: z.string(),
    status: z.string(),
    isLatest: z.boolean(),
  }),
  goal: z.object({
    type: z.literal('goal'),
    threadId: z.string(),
    objective: z.string(),
    status: z.string(),
    ...strings('turnId'),
    ...numbers('tokenBudget', 'tokensUsed', 'timeUsedSeconds', 'createdAt', 'updatedAt'),
  }),
  tool_call: z
    .object({
      type: z.literal('tool_call'),
      status: z.string(),
      ...strings('toolCallId', 'title', 'kind', 'activityKind', 'toolName', 'schedulingTimeZone'),
      content: supportedArray(historyToolContentSchema).nullish(),
      locations: z
        .array(z.object({ path: z.string(), ...numbers('startLine', 'endLine', 'line') }))
        .nullish(),
      ref: optionalObject({ machineId: z.string(), turnId: z.string(), index: z.number() }),
      rawInput: schedulingInput,
      rawOutput: z.union([z.string(), schedulingOutput]),
      permissionRequest: optionalObject({
        requestId: z.string(),
        options: z.array(
          z.object({
            optionId: z.string(),
            name: z.string(),
            ...strings('kind', 'description'),
            _meta: permissionMeta,
          })
        ),
        _meta: permissionMeta,
        outcome: optionalObject({
          outcome: z.string(),
          ...strings('optionId'),
          _meta: permissionMeta,
        }),
      }),
    })
    .refine((value) => typeof value.toolCallId === 'string' || value.ref != null),
  subagent_task: z.object({
    type: z.literal('subagent_task'),
    taskId: z.string(),
    status: z.string(),
    ...strings(
      'taskKind',
      'actor',
      'parentTaskId',
      'modelId',
      'event',
      'toolUseId',
      'subagentType',
      'taskType',
      'workflowName',
      'description',
      'summary',
      'rawStatus',
      'lastToolName',
      'error'
    ),
    ...numbers('startedAtEpochSeconds', 'endedAtEpochSeconds'),
    ...flags('isBackgrounded', 'skipTranscript', 'hasOutputFile'),
    usage: optionalObject({ ...numbers('totalTokens', 'toolUses', 'durationMs') }),
  }),
  available_commands: z.object({
    type: z.literal('available_commands'),
    commands: z.array(
      z.object({
        name: z.string(),
        ...strings('description'),
        input: optionalObject({ ...strings('hint') }),
      })
    ),
  }),
  system_notice: z.object({
    type: z.literal('system_notice'),
    name: z.string(),
    meta: optionalObject({
      ...flags('truncated', 'terminalOmitted', 'thinkingOmitted'),
      ...strings(
        'reason',
        'code',
        'message',
        'source',
        'proposalId',
        'title',
        'body',
        'outcome',
        'taskId',
        'sourceSessionId',
        'sourceTurnId',
        'sourceTitle'
      ),
      proposedBy: actor,
    }),
  }),
  operation_completion: z.object({
    type: z.literal('operation_completion'),
    deliveryId: z.string(),
    operationId: z.string(),
    operationKind: z.string(),
    completion,
    continuation: optionalObject({ status: z.string(), reason: error }),
  }),
  worktree_script: z.object({
    type: z.literal('worktree_script'),
    phase: z.string(),
    status: z.string(),
    steps: z.array(
      z.object({
        command: z.string(),
        status: z.string(),
        output: z.string(),
        ...flags('truncated'),
        exitStatus,
        ...numbers('startedAt', 'endedAt'),
      })
    ),
    ...numbers('startedAt', 'endedAt'),
  }),
  comment_reference: z.object({
    type: z.literal('comment_reference'),
    source: z.string(),
    path: z.string(),
    lineNumber: z.number(),
    side: z.string(),
    commentBody: z.string(),
    authorName: z.string(),
    ...strings('authorImage', 'turnId', 'mode', 'threadId'),
    ...numbers('githubThreadId'),
    replies: z.array(z.object({ authorName: z.string(), body: z.string() })).optional(),
  }),
  visual_annotation_reference: z.object({
    type: z.literal('visual_annotation_reference'),
    source: z.string(),
    commentId: z.string(),
    body: z.string(),
    ...strings('turnId', 'authorName', 'status'),
    anchor: z.object({
      version: z.literal(1),
      page: z.object({
        url: z.string(),
        pathname: z.string(),
        viewport: z.object({
          width: z.number(),
          height: z.number(),
          ...numbers('devicePixelRatio', 'scrollX', 'scrollY'),
        }),
      }),
      click: z.object({
        ...numbers(
          'x',
          'y',
          'clientX',
          'clientY',
          'pageX',
          'pageY',
          'viewportXRatio',
          'viewportYRatio',
          'button'
        ),
      }),
      target: z.object({
        tag: z.string(),
        ...strings('id', 'role', 'text', 'xpath'),
        selector: z.string(),
        rect,
        rectRatio: rect,
        attributes: z.record(z.string(), z.string()),
      }),
      context: z.object({
        ancestors: z.array(
          z.object({ tag: z.string(), ...strings('id', 'role', 'selector', 'text') })
        ),
        nearbyText: z.array(z.string()).optional(),
      }),
    }),
  }),
} satisfies Record<string, z.ZodType>;

export type HistoryContentValidation =
  | { status: 'accepted'; value: object }
  | { status: 'unsupported' }
  | { status: 'invalid'; issues: { path: string; code: string }[] };

/** Never throws for JSON input; diagnostics distinguish unsupported from broken known items. */
export function validateHistoryContent(value: unknown): HistoryContentValidation {
  if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
    return { status: 'invalid', issues: [{ path: 'type', code: 'missing_type' }] };
  }
  if (!Object.hasOwn(variants, value.type)) return { status: 'unsupported' };
  let input: object = value;
  // Legacy CronCreate receipts can live only in terminal_output. The scheduled
  // task reader uses the receipt's job id to recognize CronDelete; removing it
  // would resurrect cancelled tasks. Move this specific business result into
  // the declared rawOutput field before dropping ordinary terminal blocks.
  if (value.type === 'tool_call') {
    const tool = value as {
      toolName?: unknown;
      title?: unknown;
      rawOutput?: unknown;
      content?: unknown;
    };
    if (
      (tool.toolName ?? tool.title) === 'CronCreate' &&
      tool.rawOutput == null &&
      Array.isArray(tool.content)
    ) {
      const receipts = tool.content.flatMap((block: unknown) => {
        if (
          !block ||
          typeof block !== 'object' ||
          !('type' in block) ||
          block.type !== 'terminal_output' ||
          !('output' in block) ||
          typeof block.output !== 'string'
        )
          return [];
        return [block.output];
      });
      if (receipts.length) input = { ...value, rawOutput: receipts.join('\n') };
    }
  }
  const parsed = variants[value.type as keyof typeof variants].safeParse(input);
  return parsed.success
    ? { status: 'accepted', value: parsed.data }
    : {
        status: 'invalid',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
        })),
      };
}
