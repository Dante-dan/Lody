# Temporary session write-validation bypass

Status: implemented
Translation: current

[中文](2026-09-07-temporary-session-validation-bypass.zh.md)

## Abstract

Sending a valid message can fail because Mirror validates unrelated historical
items against the current client's schema. Accepting unknown item discriminators
alone does not fix this: an unknown item with an object-valued `text` still fails
the declared string field check. Session Mirrors in the renderer and CLI now
temporarily disable whole-state write validation to restore writes. External input
parsing remains, but this removes a defense against malformed new internal writes;
it is not a completed typed-writer or tolerant-reader design.

## Decision and scope

[PR #460](https://github.com/LodyAI/Lody/pull/460) sets `validateUpdates: false`
at both production `sessionDocSchema` Mirror constructors. Other document kinds
are unchanged. Schemas still determine storage layout, and explicit schema/Zod
checks remain available. This change adds no migration, history cleanup, or writer.

Keeping unknown discriminators alone was reproduced as insufficient. Disabling
only unknown-type checks would also leave malformed known history able to block
unrelated writes. The temporary choice prioritizes session availability while the
existing HistoryWriter work proceeds; it does not wait for #443 or #359.

## Replacement condition and costs

- Replace the bypass with typed, local HistoryWriter operations covering renderer,
  CLI, and feature-flag fallback paths. Do not restore whole-history validation on
  sends merely because the main view path has switched writers.
- This is expected to be short-lived, but has no automatic time-based expiry.
- New internal malformed values can persist if they bypass external input parsing.
  No new field isolation, diagnostics, or preserve-old-value-on-invalid-update
  mechanism is introduced.
- Storage mapping/diff errors and reader/rendering failures remain possible. The
  flag only removes the whole-state validation failure, not every send failure.

## Evidence and limits

Synthetic real-Loro two-replica tests cover live imports and snapshot reopening,
unknown types with object-valued `text`, and malformed known text items. Before
the flag, four cases fail at whole-state validation; after it, they pass. Tests
assert unchanged old turn JSON after append, no writes on snapshot opening/read,
legal user-message append, sibling text editing, concurrent future payload edits,
replica convergence, and retained future container IDs. A construction-site check
covers both renderer and CLI options; explicit input parsing still rejects the
malformed and unknown new items.

These tests use Loro 1.15.1 / Mirror 2.3.1 from an existing local dependency tree.
They are not full application entrypoint or released-old-binary tests, nor desktop,
mobile, or 3000-round end-to-end acceptance. Existing CLI history sanitization is
unchanged; the tested no-rewrite claims apply to these Mirror operations, not every
application startup path.
