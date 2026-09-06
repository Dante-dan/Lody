import { describe, expect, it } from 'vitest';
import { validateHistoryContent, removeSerializedToolImages } from '../src/history-content-schema';
import {
  parseAskUserQuestionPermissionMeta,
  extractAskUserQuestionAnswersFromOutcome,
} from '../src/acp/ask-user-question';
import { collectPendingScheduledTasksFromHistory } from '../src/scheduled-tasks-from-history';

function accepted(value: unknown) {
  const result = validateHistoryContent(value);
  expect(result.status).toBe('accepted');
  if (result.status !== 'accepted') throw new Error('Expected accepted fixture');
  return result.value;
}

describe('closed history write candidate', () => {
  it('does not resurrect a deleted cron whose receipt lived only in terminal output', () => {
    const items = [
      {
        type: 'tool_call',
        toolCallId: 'create-1',
        title: 'CronCreate',
        status: 'completed',
        rawInput: { cron: '* * * * *', prompt: 'Report' },
        content: [{ type: 'terminal_output', output: 'Created job: task-123' }],
      },
      {
        type: 'tool_call',
        toolCallId: 'delete-1',
        title: 'CronDelete',
        status: 'completed',
        rawInput: { id: 'task-123' },
      },
    ];
    expect(collectPendingScheduledTasksFromHistory([{ items }])).toEqual([]);
    const projected = items.map(accepted);
    expect(projected[0]).toMatchObject({ content: [], rawOutput: 'Created job: task-123' });
    expect(collectPendingScheduledTasksFromHistory([{ items: projected }])).toEqual([]);
  });
  it('preserves scheduled-task derivation, including deletion by legacy output text', () => {
    const items = [
      {
        type: 'tool_call',
        toolCallId: 'cron-1',
        title: 'CronCreate',
        status: 'completed',
        rawInput: { cron: '* * * * *', prompt: 'Report' },
        rawOutput: 'Created job-1',
      },
      {
        type: 'tool_call',
        toolCallId: 'delete-1',
        title: 'CronDelete',
        status: 'completed',
        rawInput: { id: 'job-1' },
      },
      {
        type: 'tool_call',
        toolCallId: 'wake-1',
        title: 'ScheduleWakeup',
        status: 'completed',
        rawInput: { delaySeconds: 30, reason: 'Follow up' },
      },
    ];
    const before = collectPendingScheduledTasksFromHistory([{ endedAt: 1000, items }]);
    const after = collectPendingScheduledTasksFromHistory([
      { endedAt: 1000, items: items.map(accepted) },
    ]);
    expect(before).toHaveLength(1);
    expect(before[0]?.summary).toBe('Follow up');
    expect(after).toEqual(before);
  });

  it('retains structured media that has an actual renderer', () => {
    const item = {
      type: 'tool_call',
      toolCallId: 'media-1',
      status: 'completed',
      content: [
        { type: 'content', content: { type: 'image', mimeType: 'image/png', data: 'AAAA' } },
        { type: 'content', content: { type: 'audio', mimeType: 'audio/wav', data: 'AAAA' } },
      ],
    };
    expect(accepted(item)).toEqual(item);
  });
  it('preserves the questions and answers consumed by the actual permission reader', () => {
    const permission = {
      requestId: 'request-1',
      options: [{ optionId: 'answer', name: 'Answer' }],
      _meta: {
        claudeCode: {
          askUserQuestion: {
            questions: [{ question: 'Choose', header: 'Choice', options: [{ label: 'A' }] }],
          },
        },
      },
      outcome: {
        outcome: 'selected',
        optionId: 'answer',
        _meta: { claudeCode: { askUserQuestion: { answers: { Choose: 'A' } } } },
      },
    };
    const result = accepted({
      type: 'tool_call',
      toolCallId: 'tool-1',
      status: 'completed',
      permissionRequest: permission,
    }) as { permissionRequest: typeof permission };
    const before = parseAskUserQuestionPermissionMeta(permission._meta);
    const after = parseAskUserQuestionPermissionMeta(result.permissionRequest._meta);
    expect(before).not.toBeNull();
    expect(after).toEqual(before);
    if (!before || !after) throw new Error('Expected a supported question');
    expect(
      extractAskUserQuestionAnswersFromOutcome(after, result.permissionRequest.outcome)
    ).toEqual(extractAskUserQuestionAnswersFromOutcome(before, permission.outcome));
  });
  it('drops undeclared fields without changing the input', () => {
    const input = { type: 'text', text: 'hello', unused: { large: 'discard' } };
    expect(accepted(input)).toEqual({ type: 'text', text: 'hello' });
    expect(input.unused).toEqual({ large: 'discard' });
  });

  it('does not let unknown or malformed messages reject their neighbors', () => {
    const batch = [
      { type: 'text', text: 'first' },
      { type: 'future_variant', large: 'unused' },
      { type: 'text', text: 123 },
      { type: '__proto__' },
      { type: 'thought', text: 'last' },
    ];
    const results = batch.map(validateHistoryContent);
    expect(results.map((r) => r.status)).toEqual([
      'accepted',
      'unsupported',
      'invalid',
      'unsupported',
      'accepted',
    ]);
  });

  it('keeps permission decisions, locations and old nullable fields', () => {
    const input = {
      type: 'tool_call',
      toolCallId: 'tool-1',
      status: 'completed',
      content: null,
      locations: null,
      permissionRequest: {
        requestId: 'request-1',
        options: [{ optionId: 'allow-1', name: 'Allow', kind: 'allow_once', future: true }],
        outcome: { outcome: 'selected', optionId: 'allow-1', future: true },
        future: 'unused',
      },
    };
    expect(accepted(input)).toEqual({
      type: 'tool_call',
      toolCallId: 'tool-1',
      status: 'completed',
      content: null,
      locations: null,
      permissionRequest: {
        requestId: 'request-1',
        options: [{ optionId: 'allow-1', name: 'Allow', kind: 'allow_once' }],
        outcome: { outcome: 'selected', optionId: 'allow-1' },
      },
    });
  });

  it('filters unknown tool blocks and retired terminal output independently', () => {
    expect(
      accepted({
        type: 'tool_call',
        toolCallId: 'tool-1',
        status: 'completed',
        content: [
          { type: 'future_block', data: 'unused' },
          { type: 'terminal_output', output: 'not persisted' },
          { type: 'terminal_command', command: 'echo hello', args: null, future: true },
          { type: 'content', content: { type: 'text', text: 'kept', future: true } },
        ],
      })
    ).toEqual({
      type: 'tool_call',
      toolCallId: 'tool-1',
      status: 'completed',
      content: [
        { type: 'terminal_command', command: 'echo hello', args: null },
        { type: 'content', content: { type: 'text', text: 'kept' } },
      ],
    });
  });

  it('preserves file, image and mention metadata used by existing consumers', () => {
    const fixtures = [
      {
        type: 'image',
        imageId: 'image-1',
        mimeType: 'image/png',
        sizeBytes: 10,
        storageSessionId: 'session-1',
      },
      {
        type: 'file',
        fileId: 'file-1',
        fileName: 'example.txt',
        mimeType: 'text/plain',
        sizeBytes: 10,
        sha256: 'hash',
        textPreview: true,
        transport: 'local',
        machineId: 'machine-1',
        uploadedAt: 1,
      },
      {
        type: 'text',
        text: '@Role',
        spans: [{ start: 0, end: 5, kind: 'agent_role', label: 'Role', target: 'role-1' }],
      },
      {
        type: 'tool_call',
        status: 'completed',
        ref: { machineId: 'machine-1', turnId: 'turn-1', index: 0 },
      },
      {
        type: 'system_notice',
        name: 'session_fork_origin',
        meta: { sourceSessionId: 'session-1', sourceTurnId: 'turn-1', sourceTitle: 'Source' },
      },
    ];
    for (const value of fixtures) expect(accepted(value)).toEqual(value);
  });

  it('also preserves supported variants not represented in every local corpus', () => {
    const rectangle = { x: 0, y: 0, width: 1, height: 1 };
    const fixtures = [
      { type: 'plan', entries: [{ content: 'Step', priority: 'high', status: 'pending' }] },
      {
        type: 'proposed_plan',
        turnId: 'turn-1',
        markdown: 'Plan',
        status: 'completed',
        isLatest: true,
      },
      { type: 'goal', threadId: 'thread-1', objective: 'Goal', status: 'active' },
      { type: 'subagent_task', taskId: 'task-1', status: 'completed', summary: 'Done' },
      { type: 'available_commands', commands: [{ name: 'help', input: { hint: 'Topic' } }] },
      {
        type: 'operation_completion',
        deliveryId: 'delivery-1',
        operationId: 'op-1',
        operationKind: 'session_chat',
        completion: {
          type: 'result',
          value: {
            items: [
              {
                status: 'succeeded',
                target: { sessionId: 'session-1', userTurnId: 'turn-1' },
                assistantTurnId: 'reply-1',
                output: { text: 'Done' },
              },
            ],
          },
        },
      },
      {
        type: 'worktree_script',
        phase: 'setup',
        status: 'completed',
        steps: [{ command: 'echo ok', status: 'completed', output: 'ok' }],
      },
      {
        type: 'comment_reference',
        source: 'lody',
        path: 'file.ts',
        lineNumber: 1,
        side: 'additions',
        commentBody: 'Comment',
        authorName: 'Reviewer',
        replies: [{ authorName: 'Author', body: 'Reply' }],
      },
      {
        type: 'visual_annotation_reference',
        source: 'visual_annotation',
        commentId: 'comment-1',
        body: 'Annotation',
        anchor: {
          version: 1,
          page: {
            url: 'https://example.test',
            pathname: '/',
            viewport: { width: 100, height: 100, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
          },
          click: {
            clientX: 0,
            clientY: 0,
            pageX: 0,
            pageY: 0,
            viewportXRatio: 0,
            viewportYRatio: 0,
          },
          target: {
            tag: 'button',
            selector: '#save',
            attributes: { 'data-testid': 'save' },
            rect: rectangle,
            rectRatio: rectangle,
          },
          context: { ancestors: [] },
        },
      },
    ];
    for (const value of fixtures) expect(accepted(value)).toEqual(value);
  });

  it('only removes recognized JSON image wrappers from tool text', () => {
    const text = JSON.stringify([
      { imageUrl: { url: 'data:image/png;base64,AAAA' } },
      { type: 'text', text: 'keep' },
    ]);
    expect(removeSerializedToolImages(text)).toBe(JSON.stringify([{ type: 'text', text: 'keep' }]));
    expect(removeSerializedToolImages('Example: data:image/png;base64,AAAA')).toBe(
      'Example: data:image/png;base64,AAAA'
    );
    expect(accepted({ type: 'text', text })).toEqual({ type: 'text', text });
  });
});
