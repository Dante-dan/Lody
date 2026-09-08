# Resolve task proposals without stale history replacement

Status: implemented
Translation: current

[中文](2026-09-08-task-proposal-decision.zh.md)

## Abstract

Resolving a task proposal read an entry and then acquired its store again to write
the complete old entry. An agent update arriving between those steps was overwritten.
The existing WorkspaceWriter now acquires once, finds the latest proposal by id,
and updates only its decision through HistoryWriter. This repairs the observed
lost update without changing task creation, persistence or synchronization ownership.

## Responsibility and evidence

The hook passes proposal identity and outcome/taskId rather than a stored entry.
The rendered item index is no longer used to choose the target. Missing proposals
are no-ops; invalid decisions still fail the shared writer's preflight.
Replacing the whole entry inside a second acquisition was rejected because it
cannot distinguish current peer data from an old rendered snapshot.

The original two-replica counterexample reproduced on both main and PR #460.
Permanent WorkspaceWriter tests cover created/dismissed decisions with peer title,
body and read updates arriving before acquisition or concurrently offline. An
already-received insertion before the proposal verifies stable-id targeting.
They also check missing targets, invalid decisions and replica convergence.
All 8 WorkspaceWriter tests, full `pnpm check`, changed-code formatting and
documentation checks passed. The first sandboxed full run hit local socket EPERM;
the unrestricted rerun passed. Fixtures are synthetic, not user conversations.

This does not establish arbitrary structural-edit concurrency: an additional probe
that simultaneously inserted an earlier item and rewrote the proposal offline
recreated its container, losing the other peer's decision after merge. This broader
HistoryWriter item-alignment boundary is not repaired here. There is no new claim
about competing task creations, disk-crash recovery or released-client E2E safety.

This extends the [single-writer decision](../architecture/2026-09-07-single-history-writer.md).
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
