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

User Stop atomically records held Operations and their source Turns in side tables. An insert trigger also holds late acceptance
from those sources and their completion Turns; new human sources stay runnable.
This preserves the existing strict `SELECT *` readers of Operations and Deliveries.
The gate is rechecked at claim, prepare, and start. Paused work never spends another
attempt merely because a watcher or restart scanned it.

The renderer saves the include/exclude choice into
each human input, through direct dispatch, queue promotion, and steer. The provider
boundary claims a bounded snapshot of ready held results from the same requester,
in the same synchronous step as submitting the prompt. Results precede the current
user instruction as attributed reference data, using the current user config.
An already queued human input may carry ready results when it is submitted after Stop.
There is no stop counter or authoring-version check.

Results stay in the operation store; existing progress cards keep updating without
adding completion Turns during pause. The metadata projection contains counts by
requester, never result text or dispatch authority. Equal
projections are skipped. Large inputs use bounded result previews, preserving target
history references and omission metadata; overflow remains pending for a future human
input rather than scheduling extra prompts. A single input is bounded to 68 KiB.

A user-input receipt and per-result started claims commit together before the
provider call. Confirmed steer rejection releases the exact attempt; accepted steer,
completed prompt, and user cancellation consume it. Unknown provider outcomes keep
the existing uncertain recovery behavior. Failed settlements have an owned retry
which only writes the receipt, never repeats the prompt. Consumed result retention
stays at seven days; held ready results are not expired by the automatic-delivery TTL.

Cancellation from MCP, edit-and-resend, queue interruption, and local-project
removal remains turn-only. Renderer RPC and durable fallback carry the same intent:
`lastCanceledTurn` is a string for explicit Stop or an atomic `{turnId, turnOnly: true}`
object for internal cancellation. Deduplication includes intent, so an internal cancel
cannot suppress a later explicit Stop of the same turn. The additive
`deferredOperationInputs` v1 capability gates the CLI's `turnOnly` wire extension;
legacy daemons receive their original cancellation payload. Restart durability is
machine-local, not a cross-machine migration guarantee. Normal automatic completion
batching is separate future work. Product contract:
[operation-delivery-control.zh.md](../../../../specs/operation-delivery-control.zh.md).

User-triggered composer shortcuts (implement plan, create PR, fix CI) inherit the
include-results checkbox just like typed input, for both immediate and queued sends.
Background capacity retry explicitly opts out.
