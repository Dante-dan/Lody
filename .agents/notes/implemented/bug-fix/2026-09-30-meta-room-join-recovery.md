# Preserve an in-flight Streams meta-room join

Status: implemented
Translation: current

[中文](2026-09-30-meta-room-join-recovery.zh.md)

## Abstract

When the Streams meta room was still reconnecting on a connected aggregate transport, the CLI watchdog called `repo.reconnect()`. The Streams adapter treats a reconnecting room as eligible for another join, so this call could restart the join before it finished. Recovery now leaves that in-flight join to the room's own retry loop; a disconnected transport or failed room still takes the existing recovery path. A room permanently stuck in `reconnecting` remains dependent on the adapter's retry behavior and field confirmation is pending.

## Evidence and decision

[Issue #399](https://github.com/LodyAI/Lody/issues/399) reports 3–11 transport reconnects per minute during a degraded connection while the meta-room join took about 900 ms. The current `connection-recovery.ts` treated every unhealthy meta state as grounds for `repo.reconnect()`. In the installed `loro-repo` 0.21.1, `StreamsTransportAdapter.reconnect()` calls `stream.rejoin()` for a meta session in `reconnecting`, and the adapter's connection status aggregates all joined rooms. Thus a connected aggregate status with a reconnecting meta room is a room join in progress, not evidence that the transport needs restarting.

The controller skips its automatic reconnect for `connecting` or `reconnecting` meta status when aggregate transport is not `disconnected`, and does not charge the skipped pass to its transport backoff. Forced reconnects, disconnected transport, and meta `disconnected`/`error` retain their existing paths. This is narrower than adding a second room scheduler: the adapter already owns room retries, and two schedulers could repeatedly interrupt each other. The prior unmerged [PR #478](https://github.com/LodyAI/Lody/pull/478) identified the same boundary; its closure was due to the contribution policy timer, not a merged fix.

## Verification and limit

The controller test covers an in-flight join across a watchdog pass and the following backoff window, then checks that a joined room restores health. A separate test retains recovery for meta `disconnected`. These use fake timers and a fake repository; no degraded live Streams session was run. If the adapter never leaves `reconnecting`, this controller intentionally does not force a transport reconnect while aggregate transport remains connected; a future room-level timeout belongs in the adapter if field evidence shows its retry loop can stall.
