# Local history rollback

Status: implemented
Translation: current

[中文](2026-09-08-local-history-rollback.zh.md)

## Abstract

Edit-and-resend compensation previously rejected unrelated edits anywhere in history.
The receipt now restores only the contiguous range changed by its operation, using
current values for untouched rows. Peer edits to earlier messages no longer prevent
restoring the old tail. Structural changes and overlapping edits still reject rollback;
this is not durable recovery or an automatic conflict merge.

## Decision

This narrows the whole-history receipt described in the
[single-writer decision](../architecture/2026-09-07-single-history-writer.md) and addresses
the unrelated-edit case left open by [ACP input isolation](2026-09-08-acp-history-input-isolation.md).
The first remedy is a smaller compensation scope, not a duplicate recovery session.

Capture the longest unchanged prefix and suffix before/after the command. At rollback,
verify row identities/order and compare only the changed range. Restore its captured
old values without new-input parsing, retaining current values outside that range.
The existing pending-to-seen acknowledgement exception and single-use rule remain.
Deleted tail containers are recreated; untouched prefix containers remain the same.

## Evidence and limits

Real two-peer tests cover prefix edits arriving before and after rollback and converged
JSON, prefix container identity, replacement-edit rejection and one-use receipts.
The actual SessionDocument/auto-read service harness covers failed persistence with a
peer prefix edit and restoration of opaque/damaged old tail content. Writer tests: 22
passed; service tests: 8 passed. Full `pnpm check`, documentation checks and
changed-source formatting checks passed.

Row insertion/deletion/reordering anywhere remains conservatively rejected. A receipt
with several disjoint changes owns their enclosing contiguous range. This is a local
compensation, not a general CRDT undo manager; crash recovery, concurrent metadata
compensation and overlapping-history recovery remain outside this repair.

PR: [#460](https://github.com/LodyAI/Lody/pull/460).
