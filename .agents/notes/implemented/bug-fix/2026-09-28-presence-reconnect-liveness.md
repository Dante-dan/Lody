# Presence reconnect liveness

Status: implemented
Translation: current
中文：[presence-reconnect-liveness.zh.md](2026-09-28-presence-reconnect-liveness.zh.md)

## Abstract

A presence room could join once, then reconnect while CLI and MCP readers continued treating its old empty snapshot as proof that a machine was offline. Chat lists also turned an unsynced presence set into an Offline label. The reader now requires the current joined state, MCP rechecks after each completed snapshot, and the UI uses its sync state before claiming Offline. A genuinely joined and current empty snapshot can still report offline; this does not repair the separate heartbeat delivery stall.

## Evidence and decision

Issue [#484](https://github.com/LodyAI/Lody/issues/484) reports `null` as unknown and a later observed joined → reconnecting transition with an empty `Set`. `CliPresenceRuntime.waitUntilJoined()` previously used `joinedOnce`, which stayed true on reconnecting; `makeMachineLivenessLookupForMcp()` retained a resolved Promise for the whole lookup lifetime. The UI already had a three-state presence atom, but chat and sidebar list rows used set membership alone for their Offline state.

Keep the existing presence freshness predicate and three-state contract. Reset joined status on every non-joined room status; let a later joined edge restore it. Share only an in-flight MCP read within a batch, then recheck for the next lookup. When the renderer subscription is unsynced, keep known machines selectable and do not put their sessions in the Offline bucket. This permits a request to proceed into its normal deadline when actual remote reachability is unknown.

The alternative of treating every empty Set as unknown would hide a genuine offline result on a healthy synced room. Adding a new wall-clock grace period would change the existing 90-second heartbeat contract without evidence that it fixes the separate delivery queue failure.

## Verification and limits

Focused CLI tests cover joined → reconnecting → joined and a resolved empty snapshot followed by unavailable presence. Existing component presence tests cover synced versus disconnected three-state interpretation. The Linux daemon's reported ten-second drop was not reproduced on a live machine; it remains a transport recovery issue if rejoin does not occur. This change addresses the false liveness conclusion while that recovery is in progress.

Related intent: [ephemeral presence channel Spec](../../../../specs/loro-ephemeral-presence-channel.md) and [presence channel budget note](../architecture/2026-09-20-ephemeral-presence-channel-budget.md).
