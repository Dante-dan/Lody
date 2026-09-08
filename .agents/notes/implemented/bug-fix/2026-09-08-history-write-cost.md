# Reduce history write overhead

Status: implemented
Translation: current

[中文](2026-09-08-history-write-cost.zh.md)

## Abstract

The single writer added avoidable parsing, whole-turn reads and snapshot copies.
Field writes now inspect only their field, discriminated schemas use indexed lookup,
and new values skip stored-extension merging. These reduce write-side cost without
removing validation or snapshot provenance. The full-Mirror benchmark still has a
streaming regression against bare Mirror: this is not overall 10x acceptance.

## Changes and boundaries

- Derive discriminator indexes from Zod literals; retain final parsing and fallback
  for unsupported discriminator shapes. Select a unique branch without trial parsing.
- Strip transport ids with copy-on-change traversal; still reject cycles. New values
  have no old extensions to merge, so return their parsed result directly.
- `setField` locates the turn once and reads/diffs only the requested field. Invalid
  writes still leave all old fields intact, and old extensions survive field edits.
- Unchanged turns no longer cause Loro wrapper reads during write planning. Pure
  history facade updates do not run an additional control-plane Mirror write.
- Initial history is committed as one batch instead of one commit per turn.
- Cursor hashing reads detached stored JSON directly instead of capturing provenance
  and then cloning it. Fork/rollback capture protection remains; hashing still scans
  stored history, and rollback still captures before/after state.

This extends [input isolation](2026-09-08-acp-history-input-isolation.md), not the
ConversationView read architecture. No storage migration, parser relaxation or writer
feature flag is added.

## Reproduction and limits

Run `bun packages/shared/tests/history-writer.perf.ts`; optional
`HISTORY_BENCH_TURNS` and `HISTORY_BENCH_SAMPLES` select scale/repetitions.
The full-Mirror scenario uses 20 synthetic tool items per entry, nested text updates,
scalar changes and append, and checks equal final JSON across the two paths.
The isolated field scenario has 20 tool outputs of 2000 repeated synthetic strings,
no Mirror subscriber, and 100 field flips. It is not UI latency.

Against pre-change `f0523d8a`, isolated field updates measured about 0.225ms versus
0.006–0.007ms after the direct-field change (Bun 1.3.14, warm samples). The initial
200-entry full-Mirror reruns improved seed cost, but still showed slower streaming
than bare Mirror. Measurements are not the reviewer's original fixture/runtime,
and neither these numbers nor passing correctness tests prove 3000-turn acceptance.
Do not mark the overall performance gate complete on this evidence.

Final 200-entry median of three runs, milliseconds (same synthetic fixture):

| Path | Before | After | Bare Mirror after-run control |
| --- | ---: | ---: | ---: |
| Seed | 858 | 720 | 570 |
| Text chunk | 4.18 | 4.10 | 2.63 |
| Scalar | 2.22 | 1.93 | 2.52 |
| Append | 3.59 | 2.95 | 2.14 |

The text-chunk difference is too small to claim a meaningful improvement. Both modes
use the same installed Mirror/schema with whole-state validation disabled; this is an
isolated writer comparison, not a checkout/build comparison against current main.
Full `pnpm check`, docs check, shared typecheck and final benchmark JSON equality passed.

PR: [#460](https://github.com/LodyAI/Lody/pull/460).
