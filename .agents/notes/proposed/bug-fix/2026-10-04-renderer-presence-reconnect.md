# Preserve renderer liveness during bounded reconnect

Status: proposed
Translation: current

[中文](2026-10-04-renderer-presence-reconnect.zh.md)

## Abstract

Renderer reconnect currently clears the published machine presence map while the daemon may remain live. This reference fix retains the last snapshot when reconnect deliberately stops presence, and waits for the replacement room to join before publishing its store. Heartbeat timestamps remain unchanged, so existing freshness checks still expire stale machines. Real workspace teardown continues to clear presence; the Windows report has not been exercised on a live desktop.

## Decision and evidence

Issue [#480](https://github.com/LodyAI/Lody/issues/480) identifies the unconditional empty snapshot in `WorkspacePresenceTransport.onBeforeStop`. Both renderer reconnect branches stop and restart presence. They now explicitly preserve the published snapshot; disposal and cloud-plane detachment keep the default clearing behavior.

The fresh replacement store is empty before bootstrap, and local viewing writes can happen during that interval. Suppress snapshot delivery until that replacement joins, including watchdog restarts, rather than merely removing the stop callback. Teardown deletion of the local viewing key is not a remote snapshot and is suppressed. A joined empty machine set is authoritative again. Existing timestamp-based TTL remains the liveness boundary; this change neither renews old heartbeats nor adds subscriptions.

The alternative of keeping every stop snapshot would retain data after runtime disposal. The explicit reconnect option avoids that lifetime leak. This implements the existing unsynced-is-unknown intent in the [presence Spec](../../../../specs/loro-ephemeral-presence-channel.md) without changing its guarantees.

## Verification and limits

Extend the owning presence transport suite to cover retained heartbeat data, local viewing writes, repeated pre-bootstrap restarts, stale-generation join events, replacement join and final teardown. Run repository checks and record their actual outcomes in the contribution handoff. No live Windows reproduction, human approval, or PR is claimed.
