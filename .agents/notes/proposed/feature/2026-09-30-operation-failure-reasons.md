# Operation failure reasons

Status: proposed
Translation: current

[中文](2026-09-30-operation-failure-reasons.zh.md)

## Abstract

Issue #1174 reports that target authentication failures lose their actionable
reason at the Operation boundary. This proposal preserves `TARGET_FAILED`, adds
a typed optional reason and classifies three known transient reasons. It reuses
only notices before the next user turn and omits arbitrary provider text. The
existing coordinator suite passes; full checks and protocol compatibility review
remain outstanding, and the Spec has no human approval.

## Decision and limits

Copying raw notice messages was considered but rejected because they can contain
private paths and provider diagnostics. The requester gets the stable reason in
the short message. Missing or unrecognised notices retain the old generic result.
Queued user turns can make notice association ambiguous; this conservative
interval rule may omit a cause rather than borrow a later turn's failure.

The reason schemas move to a leaf module to avoid a circular import between
history schemas and Operation schemas. Existing strict old peers may reject the
new optional field; compatibility requires further review before submission.

Related decisions: [local orchestration](../../implemented/architecture/2026-09-29-local-session-orchestration.md).
Intent: [draft Spec](../../../../specs/session-orchestration.md).
Source: [Issue #1174](https://github.com/LodyAI/Lody/issues/1174).

## Verification

The owning coordinator suite passed 82 tests on the proposed source, including
auth, transient causes, provider-text omission and later-turn isolation. Full
check, docs check and mixed-version parsing remain to be completed. This is WIP,
not a submitted contribution or human-reviewed intent.
