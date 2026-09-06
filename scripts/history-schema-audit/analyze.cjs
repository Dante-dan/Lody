const fs = require('fs');
const { LoroDoc } = require(process.argv[3]);
const { validateHistoryContent, historyToolContentSchema } = require(
  process.env.LODY_HISTORY_SCHEMA_MODULE
);
const { parseAskUserQuestionPermissionMeta, extractAskUserQuestionAnswersFromOutcome } = require(
  process.env.LODY_HISTORY_PERMISSION_MODULE
);
const { collectPendingScheduledTasksFromHistory } = require(
  process.env.LODY_HISTORY_SCHEDULING_MODULE
);
function main() {
  const b = fs.readFileSync(process.argv[2]),
    d = new LoroDoc();
  let p = 4;
  for (let i = 0; i < b.readUInt32LE(0); i++) {
    const n = b.readUInt32LE(p);
    p += 4;
    d.import(b.subarray(p, p + n));
    p += n;
  }
  if (!d.getShallowValue().history) return { conversation: false };
  const h = d.getList('history').toJSON();

  let accepted = 0,
    unsupported = 0,
    invalid = 0,
    beforeBytes = 0,
    afterBytes = 0,
    legacyTurns = 0,
    invalidToolBlocks = 0,
    omittedToolBlocks = 0,
    questionMetadataMismatches = 0,
    answerMismatches = 0;
  const types = {},
    invalidByType = {},
    issues = {},
    droppedPaths = {};
  function count(v, path, out, depth = 0) {
    if (depth > 40 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) count(x, path + '[]', out, depth + 1);
    } else
      for (const [k, x] of Object.entries(v)) {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$-]{0,63}$/.test(k) ? k : '<key>';
        const q = path + '.' + key;
        out[q] = (out[q] || 0) + 1;
        count(x, q, out, depth + 1);
      }
  }
  const projectedHistory = [];
  for (const turn of h) {
    const projectedItems = [];
    projectedHistory.push({ ...turn, items: projectedItems });
    let items = turn.items;
    if (!Array.isArray(items) && typeof turn.contents === 'string') {
      legacyTurns++;
      try {
        items = JSON.parse(turn.contents);
      } catch {
        invalid++;
        issues['history.contents:invalid_json'] =
          (issues['history.contents:invalid_json'] || 0) + 1;
        items = [];
      }
    }
    if (!Array.isArray(items)) {
      if (items != null) {
        invalid++;
        issues['history.items:invalid_type'] = (issues['history.items:invalid_type'] || 0) + 1;
      }
      continue;
    }
    for (const item of items) {
      const type =
        typeof item?.type === 'string' && /^[a-z_]{1,40}$/.test(item.type) ? item.type : 'unknown';
      types[type] = (types[type] || 0) + 1;
      if (item?.type === 'tool_call' && Array.isArray(item.content)) {
        for (const block of item.content) {
          const known =
            ['content', 'terminal', 'terminal_command', 'diff'].includes(block?.type) &&
            (block.type !== 'content' ||
              ['text', 'image', 'audio', 'resource', 'resource_link'].includes(
                block.content?.type
              ));
          if (!known) {
            omittedToolBlocks++;
            continue;
          }
          const check = historyToolContentSchema.safeParse(block);
          if (!check.success) {
            invalidToolBlocks++;
            for (const issue of check.error.issues) {
              const key = 'tool_block.' + issue.path.join('.') + ':' + issue.code;
              issues[key] = (issues[key] || 0) + 1;
            }
          }
        }
      }
      const r = validateHistoryContent(item);
      beforeBytes += Buffer.byteLength(JSON.stringify(item));
      if (r.status === 'accepted') {
        accepted++;
        projectedItems.push(r.value);
        if (item.type === 'tool_call') {
          const a = item.permissionRequest,
            b = r.value.permissionRequest;
          if (
            JSON.stringify(parseAskUserQuestionPermissionMeta(a?._meta)) !==
            JSON.stringify(parseAskUserQuestionPermissionMeta(b?._meta))
          )
            questionMetadataMismatches++;
          const meta = parseAskUserQuestionPermissionMeta(a?._meta);
          if (
            meta &&
            JSON.stringify(extractAskUserQuestionAnswersFromOutcome(meta, a?.outcome)) !==
              JSON.stringify(extractAskUserQuestionAnswersFromOutcome(meta, b?.outcome))
          )
            answerMismatches++;
        }
        afterBytes += Buffer.byteLength(JSON.stringify(r.value));
        const a = {},
          b = {};
        count(item, type, a);
        count(r.value, type, b);
        for (const [k, n] of Object.entries(a)) {
          const removed = n - (b[k] || 0);
          if (removed > 0) droppedPaths[k] = (droppedPaths[k] || 0) + removed;
        }
      } else if (r.status === 'unsupported') unsupported++;
      else {
        invalid++;
        invalidByType[type] = (invalidByType[type] || 0) + 1;
        for (const issue of r.issues) {
          const path = type + '.' + issue.path.replace(/\.\d+(?=\.|$)/g, '.[]') + ':' + issue.code;
          issues[path] = (issues[path] || 0) + 1;
        }
      }
    }
  }
  d.free();
  return {
    conversation: true,
    schedulingMismatch:
      JSON.stringify(collectPendingScheduledTasksFromHistory(h)) !==
      JSON.stringify(collectPendingScheduledTasksFromHistory(projectedHistory)),
    userRounds: h.filter((x) => x.role === 'user').length,
    entries: h.length,
    legacyTurns,
    invalidToolBlocks,
    omittedToolBlocks,
    questionMetadataMismatches,
    answerMismatches,
    accepted,
    unsupported,
    invalid,
    beforeBytes,
    afterBytes,
    types,
    invalidByType,
    issues,
    droppedPaths,
  };
}
try {
  console.log(JSON.stringify(main()));
} catch (e) {
  console.log(JSON.stringify({ failed: true, errorClass: e.name }));
  process.exitCode = 1;
}
