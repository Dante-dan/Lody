# Mirror text-event path copies

Status: implemented
Translation: current

[中文](2026-09-08-mirror-text-event-path.zh.md)

## Abstract

After target-local writing, a single text chunk still spent most of its time in the
Mirror reader's whole-root Immer update. A pinned Mirror 2.3.1 patch copies only the
ancestors of an existing text leaf, reusing unchanged branches and preserving property
descriptors. Complex events retain the original implementation. This improves the
single-text path without changing storage or notifications; bulk imports and application
end-to-end performance remain separate limits.

## Decision

This follows [target-local streaming](2026-09-08-targeted-history-streaming.md), not a
second writer or a ConversationView rollout. The optimization belongs inside Mirror's
event application, so both local writer commits and peer imports can benefit. It uses
the existing text-delta implementation and preserves non-enumerable, read-only `$cid`.
It does not mutate previous snapshots, suppress commits, bypass parsing, or skip delivery
to subscribers. Storage remains Loro 1.15.1 with the existing schema.

Only one text event with an existing string baseline and ordinary object/numeric-array
path qualifies. Missing baselines, tree-id paths, accessors and structural/multi-event
batches use the general implementation. Copying array ancestors remains proportional to
their widths; this is not O(1) arbitrary history access. Path copying uses descriptors
instead of object spreading to preserve container identity and avoid invoking getters.

The patch includes both source and published JavaScript, with a lockfile hash. It can
be withdrawn independently of the history storage schema. Future #443 storage hints
and their Mirror patch must be composed with it rather than overwriting either patch.
No dependency publication or upstream PR is implied by this local patch.

## Evidence and remaining work

The synthetic benchmark accepts `HISTORY_BENCH_BASELINE_ENTRY` pointing to the extracted
unpatched 2.3.1 entrypoint. It alternates baseline/patched reader order, uses the same
current writer, asserts complete stored/read JSON equality, and checks two real replicas
with old/new readers and concurrent field/text edits. Timings separate input preparation,
container creation and commit/subscribers. Timing observations are not test thresholds.
Final comparisons use one fresh process per paired sample (`HISTORY_BENCH_SAMPLES=1`,
`HISTORY_BENCH_SAMPLE_OFFSET=0|1|2`, `HISTORY_BENCH_PAIRED_ONLY=1`). Each view is disposed
and each document explicitly freed. Repeated Node seeds in one long-running process grew
slower even with explicit free/GC; its underlying cause is not fully established here.
Process isolation avoids relying on that reclamation behavior, not a production lifecycle fix.

Regression coverage includes Unicode text, immutable old snapshots, sibling reference
reuse, `$cid` flags, synchronous subscribers, later Mirror-authored writes, peer insert
and delete, mixed events, root text and tree fallback. The shipped upstream event tests
also exercise the patched source while repository tests exercise the published runtime.

Serialized Bun 1.3.14 fresh-process paired runs (three samples, 30 chunks each, no
separate warmup), median sample-average ms per chunk:

| History entries | Unpatched reader | Patched reader |
| --- | ---: | ---: |
| 50 | 1.060 | 0.189 |
| 200 | 3.839 | 0.156 |
| 400 | 6.067 | 0.180 |

These compare the same target-local writer, not different writer APIs. At 200 entries,
patched seed phase medians were approximately 13ms preparation, 330ms materialization
and 555ms commit/subscribers. Startup/order effects influence seed timings; the patch is
not a demonstrated bulk-seed improvement. The earlier same-process Bun runs measured
3.486ms versus 0.139ms at 400 entries; do not combine these different protocols.
Full `pnpm check`, 21 upstream source event tests, source strict typechecking, formatting,
docs checks and frozen lockfile-only validation passed. Sandbox-only socket test failures
were rerun successfully with local socket access; no tests were removed or relaxed.

Bulk seed still pays for many nested Text/Map/List containers and their read-side
construction. Input parsing is not its dominant measured phase. We have not removed the
second registration pass without proof of schema-order safety, nor adopted a different
storage layout to improve a benchmark. No 3000-round desktop/mobile acceptance or overall
10x application claim follows from a fast single-text measurement.

Node 24.20.0 with tsx, fresh-process paired samples at 200 entries: median single-text
update 5.225ms unpatched versus 0.181ms patched. Bun and Node are different runtime
measurements; neither runs the actual desktop/mobile UI or full production subscriber set.

PR: [#460](https://github.com/LodyAI/Lody/pull/460).
