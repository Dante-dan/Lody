# Preserve the meta room's active Streams recovery

Status: implemented
Translation: current
Related: [中文](2026-10-07-meta-room-recovery-ownership.zh.md)

## Abstract

The CLI watchdog could interrupt a recovering meta room even while the aggregate
transport was live. The current Streams adapter retries individual rooms, but
`StreamsCrdt.rejoin()` still resets backoff and aborts an active reconnect request.
Automatic controller passes now leave that room's in-flight recovery alone;
terminal room failures and explicit forced reconnects retain their recovery path.
The existing controller regression suite verifies eventual readiness, not a live
packet-loss reproduction.

## Decision and evidence

[Issue #399](https://github.com/LodyAI/Lody/issues/399) describes the watchdog
restarting a slow meta-room recovery. At `loro-repo` 0.21.1 and `streams-crdt`
0.16.1, the adapter's reconnect sweep includes `reconnecting` rooms. The persistent
`StreamsCrdt` implementation protects `connecting` reads with healthy writes, but
an in-flight read retry reports `reconnecting`: `rejoin()` then clears retry state
and aborts its request. The current failure is room-level interruption, rather
than proof that the current adapter tears down the entire transport.

Non-forced passes preserve `connecting`/`reconnecting` meta rooms while the
aggregate is not `disconnected`. Such a skipped pass is not charged as a failed
controller recovery and does not schedule another reconnect. The room library
owns its retry; `error`/`disconnected` still enter controller recovery, as does an
explicit forced reconnect. Genuine aggregate disconnection remains unchanged.
This changes no public protocol or Spec intent.

A separate join deadline was considered unnecessary here: it would add another
retry owner while the library already manages request failures and backoff.
[Closed, unmerged PR #478](https://github.com/LodyAI/Lody/pull/478) previously
proposed preserving in-flight meta joins. Its scope informed this investigation;
this change separately traces the current dependency's retry and terminal states.
The [local-room recovery note](2026-09-17-local-loro-join-recovery.md) describes
similar ownership for the distinct Electron relay boundary.

## Validation and limits

The added slow-room scenario in `tests/reconnect-storm-repro.test.ts` remained
`reconnecting` after 90 simulated seconds on the unchanged controller. With the
fix, its original attempt reaches `joined` and publishes the online signal once.
Terminal `error`/`disconnected` and forced-reconnect controls still restore healthy
state. Together with `connection-recovery.test.ts`, all 19 tests pass. Fixtures
use fake timers and synthetic room state; they do not exercise real network loss
or prove every Streams implementation detail. The existing two recovery signals,
flap-aware backoff, and healthy room sweeps remain intact.
