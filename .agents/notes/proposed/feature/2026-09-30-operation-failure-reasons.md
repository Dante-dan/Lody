# Operation failure reasons

Status: proposed
Translation: current

[中文](2026-09-30-operation-failure-reasons.zh.md)

## Abstract

Issue #1174 reports that target authentication failures lose their actionable
reason at the Operation boundary. This proposal preserves `TARGET_FAILED`, names
the known reason in its message and classifies three known transient reasons. It reuses
only notices before the next user turn and omits arbitrary provider text. The
existing coordinator suite passes; full checks
remain outstanding, and the Spec has no human approval.

## Decision and limits

Copying raw notice messages was considered but rejected because they can contain
private paths and provider diagnostics. The requester gets the stable reason in
the short message. Missing or unrecognised notices retain the old generic result.
Queued user turns can make notice association ambiguous; this conservative
interval rule may omit a cause rather than borrow a later turn's failure.

A typed optional error field was considered but rejected: older peers use a
strict error schema and would reject the entire completion. Keeping the existing
code, message and retryable fields preserves the persisted/wire shape. Dedicated
structured causes need an explicit version-negotiated contract in later work.

Related decisions: [local orchestration](../../implemented/architecture/2026-09-29-local-session-orchestration.md).
Intent: [draft Spec](../../../../specs/session-orchestration.md).
Source: [Issue #1174](https://github.com/LodyAI/Lody/issues/1174).

## Verification

The owning coordinator suite passed 82 tests on the proposed source, including
auth, transient causes, provider-text omission and later-turn isolation. Full
check and docs check remain to be completed. This is WIP,
not a submitted contribution or human-reviewed intent.
