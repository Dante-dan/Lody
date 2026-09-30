# Bound remote upgrade replay across daemon restarts

Status: proposed
Translation: current

[中文](2026-09-30-daemon-upgrade-replay.zh.md)

## Abstract

[Issue #1178](https://github.com/LodyAI/Lody/issues/1178) reports two Linux daemons repeatedly accepting one upgrade request, including a daemon already running the target version. The proposed change completes authorized exact-version requests without exiting again and records installer attempts before npm starts, retaining them across restarts for 25 hours. A replay that still has not reached its target produces an actionable error and requires an explicit new request to retry. This bounds reinstallation without claiming to fix mismatched npm prefixes, watchdog version verification, or the unknown cause of request redelivery.

## Evidence and scope

The issue contains observed incident logs, not a clean reproduction. Current code only keeps `pendingProcessLifecycleAction` in Worker memory and deletes the installer intent after each attempt; neither survives as replay evidence. Machine RPC stream retention is 24 hours. The original [ACK delivery decision](../../implemented/bug-fix/2026-09-08-machine-lifecycle-ack.md) explicitly excluded cross-restart deduplication. This adds upgrade-specific replay handling while preserving ACK and restart behavior; the [Spec](../../../../specs/machine-lifecycle-ack.md) stays draft.

[PR #1069](https://github.com/LodyAI/Lody/pull/1069) migrates installer execution to a process tree facade, but does not change replay completion or intent cleanup. This proposal does not duplicate that execution refactor.

## Decision and limits

A JSON receipt file in `getLodyDataDir()` records request ID, requester, target, and local attempt time before accepting the upgrade. The installer changes the prepared receipt to attempted before npm starts; receipt write errors therefore fail admission while the Worker is still online. It stores no request tokens or logs, uses an atomic rename with private file permissions, and prunes expired entries when recording an attempt. Read/parse/write failures do not permit unprotected installation. A failed or interrupted attempt still prevents automatic retry for the same request. An exact target already running returns success with `accepted=false`, which keeps the lifecycle callback inactive. For `latest`, no resolved target is known, so replay returns an error rather than reporting success.

Memory-only state cannot handle a restarted Worker. Simply clearing or preserving the transient upgrade intent cannot distinguish installer work from a completed attempt. Permanent receipts would grow without a retention policy; 25 hours covers the existing 24-hour RPC window with an hour of margin. Local clock changes and requests outside that window are limits, not permanent exactly-once guarantees. Installation-prefix repair and handoff verification remain separate work; this PR must reference, rather than close, #1178.

## Verification

The owning installer test suite is extended to retain real on-disk receipts across module reload, cover successful and failed npm shims, recognize an already-running target, reject `latest` replay, preserve explicit fresh-request retries, and exercise retention expiry. No affected Linux host, real global npm installation, cloud RPC, or watchdog restart was executed. All 13 lifecycle tests passed using the existing npm shim and an explicit 60-second cold-import setup budget, retaining the existing test timeouts and behavior assertions. The default 10-second setup hook timed out while importing the lifecycle dependency graph during the full concurrent suite; this is a setup-time failure, not evidence of an installer behavior failure. `pnpm format` and `pnpm run docs check` passed (the latter reports existing warnings). CLI typecheck passed after aligning the pinned ACP submodules and reinstalling the current frozen lockfile. The earlier missing Devin manifests and MCP client types came from stale reused checkout dependencies. Full `pnpm check` was invoked; its final result is recorded separately.
