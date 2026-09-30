# Project grouping reference model

Status: proposed
Translation: current

[中文](2026-09-30-project-groups.zh.md)

## Abstract

Issue #1144 requests organization across local projects and conversations without
changing execution ownership. The proposed first slice models references with
machine-qualified project identity and existing session identity. Unavailable
members remain visible to a caller's resolution layer instead of being silently
removed. A bounded storage layer now persists independent membership rows in the existing
workspace document and exposes a local-durability-first Repo operation. Navigation
and commands remain absent; this does not deliver the full feature.

## Decision and evidence

Machine Flock already owns local projects; Workspace Flock owns shared catalogs.
Moving root paths into a group or changing ProjectRef would conflate organization
with execution. The reference model therefore holds IDs only and leaves access
checks to existing readers. The storage implementation uses separate membership rows to preserve concurrent
additions rather than persisting the read projection array wholesale.

The alternative of deriving identity from project path/name loses machine identity.
The alternative of hiding unresolved members makes offline state look like deletion.
The model avoids both, without changing execution protocols; the
[Spec](../../../../specs/project-groups.md) remains draft.

## Validation limits

Repository Vitest tests exercise machine-qualified identity, immutable add/remove,
idempotency, unresolved-member retention and unbound conversation references.
No UI, CLI or offline-machine end-to-end behavior is claimed. The exported storage API is a bounded proposal; no human Spec approval or PR is claimed.

The focused Vitest 3.2.4 suite passed all three tests on 2026-09-30.
The reference source and test were formatted with the repository Oxfmt version.
The full workspace install could not restore current-head dependencies: the
Codex submodule manifest requires a newer version than the root lockfile, and
the declared minimum-release-age policy rejects that newly published version.
Full repository check/format therefore did not pass; no integration validation
is inferred from the focused result. Documentation check passed.

The extended owning suite passed six tests, including disjoint membership-row
merges, malformed/orphan rows, exact deletion, and local durability after upload
failure. Existing workspace document ID construction moved to a dependency-free
module and remains re-exported from its original API. No root lockfile, execution
object, MCP/Role schema, or platform composition was changed.

A strict TypeScript slice check was attempted; it could not complete because
existing transitive shared-package imports lack their workspace dependencies.
No successful package or workspace typecheck is claimed.
