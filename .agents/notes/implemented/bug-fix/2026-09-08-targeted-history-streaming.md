# Target-local history streaming

Status: implemented
Translation: current

[中文](2026-09-08-targeted-history-streaming.zh.md)

## Abstract

The generic writer still produced and planned an entire history for each streaming
chunk. An existing-turn update now produces only that turn and writes through the same
validation/materialization owner. ACP text/thought-only batches use this path; tool and
subagent updates retain their original cross-turn routing. Input filtering is compiled
from existing Zod definitions once instead of projecting and trial-parsing each value.
This removes repeated writer work, not the Mirror reader or all performance limits.

## Responsibility and compatibility

This follows [write-side cost reduction](2026-09-08-history-write-cost.md). It does not
add a second writer or adopt ConversationView. `updateEntry` resolves the live container
and uses the matching current Mirror row when available. Missing targets return false,
ids are immutable, and malformed changes fail before CRDT operations. Tail lookup visits
the last row first; old targets may still require a reverse scan. There is no persistent
index with assumptions about peer edits or duplicate legacy ids.

SessionDocument accepts an explicit `onlyEntryId` contract: the callback sees only that
existing row and must return exactly it. Missing targets retain normal creation.
ACP narrows only targeted agent text/thought chunks. A tool update may belong to an older
turn, so tool/subagent/mixed batches must retain full-history routing.

The input parser clones supported Zod definitions with checks/refinements intact,
changing closed-object unknown-key handling to stripping. Original RPC schemas remain
strict; open JSON extension dictionaries remain open. Transport-id stripping and JSON
safety checks still apply. No old stored document is reparsed or migrated.

Item alignment no longer repeatedly scans already-consumed prefixes or allocates suffix
slices. Stored-copy matching indexes source ids once, retaining the first-match rule
because incoming copy ids were already proven unique. Generic structural matching and
the second turn-level materializer diff still exist; this is not arbitrary O(1) history.

## Evidence and limits

Tests cover schema immutability/refinements, target id/type rejection before writes,
real peer insertion/deletion, target-only callback scope, old tool ownership and missing
target creation. The benchmark compares bare Mirror, generic writer and targeted writer
with identical final JSON. Its targeted case mutates nested tool text directly through
the writer API; it does not claim ACP tool notifications use the text-only fast path.
`streamCommit` includes CRDT commit and synchronous subscribers, not only Mirror CPU.

The installed Mirror applies external Loro events incrementally using Immer; it does
not necessarily reread the whole document per event. Unlike its own setState, direct
writer commits cannot reuse a precomputed Mirror state. Neither this distinction nor
unit timing proves 10x UI speed or 3000-turn desktop/mobile acceptance.

Final serialized benchmark, three-run medians in ms per chunk:

| Entries | Bare Mirror | Generic writer | Targeted writer |
| --- | ---: | ---: | ---: |
| 50 | 0.77 | 1.01 | 0.57 |
| 200 | 2.76 | 4.19 | 2.36 |
| 400 | 5.03 | 7.12 | 3.69 |

At 400 entries, targeted commit/subscribers measured 3.55ms, leaving approximately
0.14ms outside commit. This identifies the remaining boundary; it is not a claim that
all 3.55ms is Mirror-exclusive CPU. Seed still regresses (generic writer 1558ms versus
bare Mirror 1236ms); seed values vary even between the two identical writer setup paths.
Do not claim all writes are faster or that the overall 10x target is achieved.
Full `pnpm check`, schema/target regression tests, formatting, docs checks and benchmark
final-state equality passed.

PR: [#460](https://github.com/LodyAI/Lody/pull/460).
