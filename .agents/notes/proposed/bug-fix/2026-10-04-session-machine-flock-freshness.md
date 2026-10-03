# Session Machine Flock freshness does not gate cached reads

Status: proposed
Translation: pending

## Abstract

A failed Machine Flock refresh prevented session creation, agent-config selection,
and ACP capability reads even when the local replica contained the required data.
The shared session read helper now attempts the bounded refresh, logs its failure,
and lets the existing reader validate the local data. This implements the scope of
[issue #485](https://github.com/LodyAI/Lody/issues/485) while preserving explicit
sync and durable-operation confirmation failures. Cached data can be stale; this
proposal does not promise fresh remote state after a failed refresh.

## Decision and alternatives

Keep the existing per-document bounded, deduplicated sync attempt; catch rejection
only in `syncMachineFlockDocsForRead`. Changing the manager's throwing API would
also weaken explicit `lody sync` and other confirmation callers. Requiring the
caller to opt into an offline mode would leave the reported local session failure
unchanged. Missing projects/configurations remain subject to the reader's existing
validation; the helper never fabricates data or grants authorization.

The related renderer retry decision is recorded in
[Machine Flock remote catch-up](../../implemented/bug-fix/2026-09-22-machine-flock-remote-sync-retry.md).
This change does not replace renderer retry behavior or its presence gate.

## Verification

The owning session helper suite covers successful and rejected freshness sync
while resolving the actual local project reference, and reads an ACP capability
row after refresh rejection. Existing explicit sync and session operation code is
unchanged. These are synthetic local fixtures; degraded production Streams and
the reported Windows environment have not been exercised.
