# One history writer before windowed readers

Status: implemented
Translation: current

[中文](2026-09-07-single-history-writer.zh.md)

## Abstract

PR #460 replaces whole-session write validation with one shared HistoryWriter for
CLI and renderer. New or changed input is parsed before mutation; unchanged opaque
history is preserved. Target-local streaming and a pinned Mirror text-event patch
reduce repeated work without changing storage. Full-history readers, bulk copying,
overlapping rollback conflicts and real 3000-round acceptance remain unresolved.

## Ownership and compatibility

```text
CLI / renderer → Session facade → HistoryWriter → Loro operations
                                      ↓               ↓
                              changed-input parser   Mirror reader → subscribers
```

The writer/materializer was extracted from #376, independently of ConversationView.
Future windowed readers must reuse it; read flags cannot switch writers.
Session Mirror skips whole-state validation, while other stores retain validation.
Commands preflight before control/history mutations and report paths/codes without
conversation contents. Opening old sessions does not sanitize their history.

Closed new-input fields are selected by the shared schemas. Explicit ACP tool/content
and location extensions retain JSON. Unknown nested discriminators cannot bypass
malformed known variants. SDK filtering is a separate boundary: synthetic direct-writer
inputs do not prove every provider shape is reachable through the installed SDK.
Deterministic rejected ACP notifications are isolated; transient failures retain the
existing bounded retry policy.

Tool fields except identity, stored input-config fields, and same-proposal metadata
parse only authored changes. Retained malformed fields do not block independent edits.
Steer provenance survives read normalization; legacy built-in CLI selectors normalize
on new writes only. Queue promotion removes the exact queued row after history accepts
it, with stable turn ids protecting retries. Proposal decisions resolve the current
proposal by id rather than replacing an earlier rendered entry.

Correlated notice name/meta schemas include fork origin and shared operation completion.
The compile-only contract checks invalid commands, nested field coverage and notice
correlations; it is not replaced by source-text assertions.

## Copies, rollback and imported history

Fork copies use a writer-captured raw snapshot authenticated by a private WeakMap.
The public getter returns a detached copy. Forged arrays cannot claim stored provenance;
authored changes still parse. Copies prepend history before target setup rows without
replacing those containers, and reject id collisions. Clearing fork-operation control
metadata clears the permanent root Map rather than attempting to delete the root.

Rollback captures only the affected raw stored range, deriving boundaries from immutable
reader views. It preserves untouched rows, automatic read acknowledgement on a new
pending replacement, and subsequent peer appends. Existing-row structural changes or
overlapping edits still reject with stale_rollback; the caller logs recovery failure.
There is no durable recovery copy or crash-recovery guarantee. Removed rows get new
containers on restoration.

Importer source hashes and turn ids stay unchanged. A versioned atomic JSON string in
the doc cursor binds stored role/items/plan hashes to source digest and length. It
distinguishes projected new storage from later local edits; accepting either raw or
sanitized hashes was rejected because it hides deletions. History and cursor are
written without an awaited gap, before publication; persistence remains the repo's
responsibility. An already-arrived source suffix is recognized without duplicating rows.
Stale/corrupt baselines fall back to exact legacy comparison, not permissive acceptance.
Old importers may still conflict on projected data. Atomic baseline growth during
changed refreshes remains a performance concern; no hash-chain replacement is implemented.

## Performance and reproduction

Input schemas are cloned/cached with refinements retained and parsed once; discriminator
indexes derive from schema literals. Scalar/fileDiff writes read only their field.
ACP text/thought-only batches use target-local updateEntry; tool/subagent/mixed batches
retain cross-turn routing. Existing Text edits keep container ids and primitive strings
stay primitive. No storage migration, attachment externalization or #359 hash-v2 rollout.

The pinned Mirror 2.3.1 patch (Loro 1.15.1) copies only ancestors of a single existing
text leaf. It preserves descriptors, old snapshots and notifications; missing baselines,
tree/accessor/structural/multi-event paths use the original implementation. Array copies
still scale with ancestor width. Future #443 storage hints/patches must compose with it,
not replace it. This text-only patch itself has no storage-format dependency.

Run `bun packages/shared/tests/history-writer.perf.ts`. For paired old/new reader runs,
set HISTORY_BENCH_BASELINE_ENTRY to unpatched Mirror 2.3.1, HISTORY_BENCH_PAIRED_ONLY=1,
HISTORY_BENCH_SAMPLES=1 and HISTORY_BENCH_SAMPLE_OFFSET=0|1|2 in separate processes.
The fixture uses 20 synthetic tool items per entry, 30 chunks, no separate warmup,
alternating order, complete JSON equality and real-replica checks.

Recorded at 76d0e9be, median sample-average ms per chunk:

| Runtime | Entries | Unpatched reader | Patched reader |
| --- | ---: | ---: | ---: |
| Bun 1.3.14 | 50 | 1.060 | 0.189 |
| Bun 1.3.14 | 200 | 3.839 | 0.156 |
| Bun 1.3.14 | 400 | 6.067 | 0.180 |
| Node 24.20.0 + tsx | 200 | 5.225 | 0.181 |

These compare the same writer, not whole applications. Repeated Node seeds in one
process slowed even with free/GC; fresh processes avoid that measurement confound,
not a proven production lifecycle fix. Bulk fork/capture and multi-event tools remain
costly. No overall 10x or 3000-user-round desktop/mobile acceptance follows.

## Evidence, history and review limits

Real Loro and service tests cover malformed-input atomicity, opaque copy, permission
enrichment, auto-read rollback, old/new replicas, current proposal targeting and cursor
conflicts. Provider/network/disk boundaries are stubbed where stated in the tests.
A combined offline proposal insertion plus proposal rewrite previously recreated its
container and lost a competing decision; arbitrary item-structural concurrency is not
claimed solved. Generic turn reorder remains unsupported.

Full pnpm check, formatting and docs checks passed after main e12cb225 integration
(commit 123e9132); the focused fork/clear/edit suite passed 38 tests. Those are historical
results, not automatic approval of later changes or deployed-client compatibility.

At the user's request, this bilingual record consolidates the PR's incremental notes.
Superseded intermediate claims and detailed run logs remain recoverable in Git history
through 123e9132. Remove source-string-only tests; retain real behavior and compile-failure
contracts. Future refinements update the owning note rather than adding a note per fix.

Intent: [draft Spec](../../../../specs/session-history-writes.md).
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
