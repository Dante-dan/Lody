# Historical field edits and queue retention

Status: implemented
Translation: pending

## Abstract

New history validation exposed legacy CLI selectors and reparsed unrelated damaged
fields during steer, tool payload and proposal updates. New writes now reuse the
existing legacy selector normalizer, while independent edits parse only changed
fields. Queue promotion retains its item until history accepts it. Rollback captures
only the changed stored range and tolerates subsequent appends; overlapping edits
and crash recovery remain unresolved rather than being overwritten.

## Decisions

This extends [local rollback](2026-09-08-local-history-rollback.md) and the
[single writer](../architecture/2026-09-07-single-history-writer.md).
The legacy normalizer is reused at the new-history boundary, not applied to old
documents. Tool fields derive from the existing schema, excluding identity.
Input-config and same-proposal metadata updates preserve unchanged malformed values
but reject newly authored invalid values. Unknown closed input fields remain filtered.

The queue peeks with its existing editing lease and removes the exact container id
only after append succeeds. If append succeeds but later publication fails, the
stable turn id lets the existing duplicate check retire the queued item on retry.
Invalid input is retained, not silently dropped or reported as delivered.

Rollback derives the affected range from immutable reader views and serializes only
that range from actual storage before writing. Subsequent appends do not belong to
the failed operation and survive compensation. Existing-row reorder and overlapping
edits still reject; no durable recovery copy or conflict merge is introduced.

## Evidence and limits

Focused writer tests pass 28 cases, including legacy selectors, unchanged invalid
config/tool/proposal fields, invalid new raw output and real peer append during
rollback. CLI queue/auto-read/edit-and-resend tests pass 58 cases, including write
rejection without losing the queued message. Shared and CLI typechecks pass.
Full `pnpm check` passed (shared 1,085; components 3,280; CLI 2,644 passed / 4 skipped),
as did formatting, documentation and whitespace checks.
These are correctness results, not full-application performance acceptance.
Bulk fork capture and general multi-event Mirror read costs are not eliminated.
The rejected overlapping rollback still needs a separately agreed recovery contract.

PR: [#460](https://github.com/LodyAI/Lody/pull/460).
