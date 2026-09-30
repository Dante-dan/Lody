# Project grouping reference model

Status: proposed
Translation: current

[中文](2026-09-30-project-groups.zh.md)

## Abstract

Issue #1144 requests organization across local projects and conversations without
changing execution ownership. The proposed first slice models references with
machine-qualified project identity and existing session identity. Unavailable
members remain visible to a caller's resolution layer instead of being silently
removed. Persistence and navigation remain deferred until membership and access
semantics are agreed; this reference does not deliver the full feature.

## Decision and evidence

Machine Flock already owns local projects; Workspace Flock owns shared catalogs.
Moving root paths into a group or changing ProjectRef would conflate organization
with execution. The reference model therefore holds IDs only and leaves access
checks to existing readers. A later storage implementation should use separate
membership rows to preserve concurrent additions, rather than persisting this
reference array wholesale.

The alternative of deriving identity from project path/name loses machine identity.
The alternative of hiding unresolved members makes offline state look like deletion.
The model avoids both, without adding protocol or storage migration before the
[Spec](../../../../specs/project-groups.md) decisions are reviewed.

## Validation limits

Repository Vitest tests exercise machine-qualified identity, immutable add/remove,
idempotency, unresolved-member retention and unbound conversation references.
No UI, CLI or offline-machine end-to-end behavior is claimed. The code is an
unexported reference proposal; no human Spec approval or PR is claimed.
