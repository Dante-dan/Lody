# Reconciliation feedback

Binding constraints live in [AGENTS.md](AGENTS.md). This page explains why
connection lifetime and change notifications matter to the coordinator.

`operation-store.ts` uses SQLite WAL. Closing the last connection checkpoints
and removes WAL/SHM sidecars. Opening and closing for each reconciliation makes
`operation-coordinator.ts` observe its own filesystem churn. Multiple workspace
coordinators share the machine store and can amplify those notifications.
Per-call MCP opens can also perform maintenance writes and trigger lock contention;
the coordinator owns maintenance, while MCP keeps a read-only schema probe before
any required migration.

`operation-progress-history.ts` projects target execution into a requester card.
With nested A -> B -> C sessions, A observes B, while B contains a card for C.
Mirror notifies subscribers even when a state updater returns unchanged history.
Writing the same card can therefore schedule another reconciliation indefinitely.
The preflight comparison avoids entering Mirror; real writes recompute against
current history so a preflight snapshot cannot overwrite an intervening update.

The real-Mirror regression is in
[operation-progress-feedback.test.ts](../../tests/operation-progress-feedback.test.ts).

## Deferred results

User Stop atomically records held Operations, their source Turns, and a monotonically
increasing stop version in side tables. An insert trigger also holds late acceptance
from those sources and their completion Turns; new human sources stay runnable.
This preserves the existing strict `SELECT *` readers of Operations and Deliveries.
The gate is rechecked at claim, prepare, and start. Paused work never spends another
attempt merely because a watcher or restart scanned it.

The renderer freezes the observed stop version and its include/exclude choice into
each human input, through direct dispatch, queue promotion, and steer. The provider
boundary claims a bounded snapshot of ready held results from the same requester,
in the same synchronous step as submitting the prompt. Results precede the current
user instruction as attributed reference data, using the current user config.
Previously queued inputs have an older version and cannot drain a later Stop.
Missing/stale versions fail closed until a newly authored input observes the projection.

Results stay in the operation store; existing progress cards keep updating without
adding completion Turns during pause. The metadata projection contains counts by
requester and the stop version, never result text or dispatch authority. Equal
projections are skipped. Large inputs use bounded result previews, preserving target
history references and omission metadata; overflow remains pending for a future human
input rather than scheduling extra prompts. A single input is bounded to 68 KiB.

A user-input receipt and per-result started claims commit together before the
provider call. Confirmed steer rejection releases the exact attempt; accepted steer,
completed prompt, and user cancellation consume it. Unknown provider outcomes keep
the existing uncertain recovery behavior. Failed settlements have an owned retry
which only writes the receipt, never repeats the prompt. Consumed result retention
stays at seven days; held ready results are not expired by the automatic-delivery TTL.

Cancellation from MCP and edit-and-resend remains turn-only. The additive
`deferredOperationInputs` v1 capability gates the CLI's `turnOnly` wire extension;
legacy daemons receive their original cancellation payload. Restart durability is
machine-local, not a cross-machine migration guarantee. Normal automatic completion
batching is separate future work. Product contract:
[operation-delivery-control.zh.md](../../../../specs/operation-delivery-control.zh.md).
