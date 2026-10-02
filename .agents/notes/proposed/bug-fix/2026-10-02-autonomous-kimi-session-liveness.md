# Autonomous Kimi turns need an explicit liveness boundary

Status: proposed
Translation: current

[中文](2026-10-02-autonomous-kimi-session-liveness.zh.md)

## Abstract

Issue [#272](https://github.com/LodyAI/Lody/issues/272) reports output resuming after background work while the session remains idle. The current managed Kimi pin keeps a prompt open through detached agent tasks and their wake turn, addressing that subset without changing Lody. However, it also streams engine-started turns after the client prompt has settled, without publishing a root-turn liveness signal. The proposed next step is a negotiated, activation-fenced root activity snapshot whose display lease is separate from human-turn authority; no production behavior is changed by this note.

## Evidence and coverage

At Lody `cf5482061968a5917337b39b31cf7ec9ae7f5d85`, the managed Kimi manifest pins `743c6641b89870dbd0596d1726ae4d34d42844e2`. Its `packages/acp-server/src/session.ts` tracks `runningTurns`, holds `pendingStopReason`, and releases a prompt only after detached agent tasks, wake grace and active turns drain. The task set deliberately includes only tasks of kind `agent`. Its owning `lody-session-updates.test.ts` separately exercises an engine-initiated turn after a prompt has already resolved. That content is forwarded, but no client prompt becomes pending again.

Lody `enqueueACPUpdate` routes this output to the finalized assistant entry. The existing active presence lease ends with the execution scope, while `resolveSessionLiveStatus` observes only presence, execution and pending dispatch. Transcript delivery therefore does not by itself establish running presence. Core activity metadata covers compaction and retries; it does not carry root-turn start/end. `_kimi/taskLifecycle` and Core subagent events describe tasks, not root session execution.

This establishes a missing boundary for independently initiated root work, not a claim that every task in the original older-version report still fails. The report does not identify the background task type. Do not expand the already adopted detached-subagent fix or claim the whole issue is resolved from that subset.

## Proposed boundary

The Core contract should advertise a versioned root activity capability. An adapter owning native main-agent events should send a bounded active-root-turn snapshot on start and end, fenced by the ACP session activation and a monotonically increasing sequence. A new activation invalidates every previous snapshot. The client accepts only the negotiated capability, attached ACP session and current activation; stale sequences cannot resurrect activity. Disconnect clears the display lease.

The daemon should combine that lease with ordinary prompt execution for display: a root turn ending must not clear a concurrent human prompt, and a human prompt ending must not clear autonomous activity. Permission waiting retains precedence. Snapshot handling must neither touch the user idle timer nor fabricate a human requester, user turn, invocation, history entry, steer ownership or replay authority. Late output keeps its existing assistant-entry routing.

A quiet-period timer or setting durable status to running for each text chunk is rejected: chunks also arrive as late tails and do not prove when work ends, and a durable working status without a live presence lease contradicts the existing status boundary. Subagent lifecycle is also insufficient because process wakes and scheduled root turns need not be subagents.

## Validation and remaining work

The current Lody live-status and transient-store suites passed 29 tests. An exact-method synthetic state experiment of the pinned Kimi drain function passed four branches: active agent task, wake grace and root turn hold settlement; fully drained state resolves `end_turn`. Docs check reported no errors. These checks did not execute the isolated Kimi integration suite or reproduce Kimi 0.39.1 on macOS.

Next executable work is to define the smallest negotiated Core snapshot contract, wire the Kimi event publisher and daemon display lease, and extend the owning behavior suites for autonomous start/end, out-of-order snapshots, detach, overlap with a new human turn, and permission waiting. A changed guarantee needs a draft Spec; this note does not assert human approval or create an implementation-before approval gate.
