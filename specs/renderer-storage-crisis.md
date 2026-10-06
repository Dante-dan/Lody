# Renderer storage crisis

Status: draft
Translation: current

[中文](renderer-storage-crisis.zh.md)

## Scenario

A local workspace cannot persist its renderer Repo because Chromium quota is
exhausted or its IndexedDB connection is closing. Freeing filesystem space does
not make the live connection healthy. Repeated session creation must not produce
raw database errors or suggest that an unpersisted write succeeded.

This is proposed intent for [#417](https://github.com/LodyAI/Lody/issues/417),
not an approved guarantee or an implemented recovery flow.

## Responsibilities

The workspace runtime owns a sticky crisis state for its Repo. Observe the storage
adapter boundary, including failed bootstrap and background persistence, rather
than relying on the chat submit catch. A typed storage `quota` or `unavailable`
failure enters crisis; `unknown` alone is insufficient to assert disk exhaustion.
Keep the first reason and safe diagnostic details. The separate Streams cursor
store's in-memory fallback does not apply to source-of-truth Repo data.

After crisis, reject new storage operations before they reach the failed adapter.
Also fence application mutations before changing live documents: rejecting a later
save alone cannot make a previously successful in-memory mutation durable. Cancel
new runtime acquisitions, transport/reconnect work and queued application writes
that require persistence. In-flight work may already have changed memory or made
partial durable progress; never imply rollback or replay uncertain sends.

The recovery surface is outside the affected workspace subtree, so both runtime
initialization failures and failures during use can show it. It blocks further
workspace editing and sending, explains that restart is required, and uses
localized copy rather than raw exception messages. It offers an explicit Quit
app action on Electron. Do not automatically reload, reset storage, reconnect the
adapter, or create an in-memory Repo.

Quit uses Electron's existing shutdown path, preserving unrelated unsaved-editor
Stay/Leave guards and owned CLI shutdown. Canceling quit keeps crisis active; it
must not restore writes. Relaunch is a separate user action. Never call a Repo
flush or database deletion as a prerequisite to exiting crisis.

## First delivery and limits

The first delivery covers renderer Repo failure detection, sticky mutation/storage
fences, the blocking recovery surface, and user-initiated normal quit. Filesystem
storage management is deferred: it needs a separately reviewed allowlist and must
not touch IndexedDB or use Repo archive/purge APIs. CLI ENOSPC handling remains
[#1054](https://github.com/LodyAI/Lody/issues/1054).

Other independently owned renderers may use different cache namespaces. This
proposal does not claim atomic cross-window write suspension, durable rollback,
recovery of unpersisted edits, or repair of a running Chromium connection. Those
would need explicit additional contracts, not a broad global crash handler.

## Validation required for implementation

Extend the owning repository suites with deterministic injected `quota` and
`unavailable` failures: awaited load, background save and bootstrap failure all
enter crisis; later mutation/storage attempts reject without changing document
state; `unknown` does not masquerade as quota. Cover a failure while a snapshot
seed save is underway, since its existing catch can swallow that failure.

Exercise the actual recovery surface and existing Electron quit ownership: Stay
retains crisis, Leave quits without resetting/deleting Repo storage. Record that
injection is not a real disk-full reproduction. Neither checks nor draft metadata
constitute human approval.

## Evidence

- [Runtime storage composition](../packages/components/src/providers/create-workspace-runtime.ts)
- [Writer mutation seam](../packages/components/src/providers/workspace-writer-impl.ts)
- [Snapshot loader](../packages/components/src/providers/local-window-bootstrap.ts)
- [Existing fatal recovery intent](renderer-fatal-recovery.md)
- [Quit ownership rules](../apps/electron/src/main/services/AGENTS.md)
- [Proposed investigation note](../.agents/notes/proposed/bug-fix/2026-10-06-renderer-storage-crisis.md)
