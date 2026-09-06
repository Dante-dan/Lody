# Fail closed on a full or dead repo IndexedDB

Status: proposed
Translation: current

English | [中文](2026-09-06-storage-crisis-fail-closed.zh.md)

## Abstract

When a user's disk filled, the renderer's CRDT replica hit `QuotaExceededError` and then
a permanently closing IndexedDB connection, so every attempt to create a session failed
with a raw Chromium DOMException in a toast, and the toasts kept coming after the user
freed space because only a process restart reopens that connection. We classify the
failure inside a wrapper around the storage adapter passed to `LoroRepo.create`, latch a
one-way breaker, and replace the repeating toasts with one blocking screen whose action
relaunches the app. Reads fail closed alongside writes, which is the load-bearing
choice: returning `undefined` would read as "this document does not exist" and let the
next write start a fresh history over durable data. The classifier still matches
DOMException message text as a fallback, which is a heuristic rather than a stable
contract; removing that depends on upstream work not yet done.

## Problem

Reported as [Lody #417](https://github.com/LodyAI/Lody/issues/417). Creating a session
showed `会话创建失败` with a body of
`Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.`,
and every retry stacked another one. Nothing in the app could succeed, and nothing in
the app said so.

Two findings shaped the fix. First, `IndexedDBStorageAdaptor.loadDoc` opens a
`readwrite` transaction even for a brand-new room that writes nothing, so session
creation breaks on the READ path, before any write — a guard in the composer would have
covered one caller out of many. Second, the dying connection is bound to the renderer
process, so freeing disk space and reloading both fail to recover it.

## Decisions and findings

The breaker lives under the repo, in `createCrisisAwareStorageAdapter`, not at the call
sites: archive, send, and workspace-catalog writes hit the same dead connection as
session creation. It re-throws every classified failure as `StorageCrisisError`, so raw
engine text cannot reach a toast even on the first failure. The mechanism is explained
in [storage crisis](../../../docs/components-storage-crisis.md).

We verified that loro-repo does not lose data when a save fails: `persistDocUpdate`
rolls `docPersistedVersions` back and re-queues the document, and `MetaPersister`
advances `lastPersistedVersion` only after `save()` resolves. So this is a UX and
correctness-of-failure problem, not a durability bug.

### Alternatives considered

**An in-memory repo fallback**, mirroring `ResilientRemoteCursorStore`. Rejected: that
store degrades safely because Streams cursors are replay checkpoints the server can
rebuild. Repo documents are the user's data, so a memory stand-in would accept writes it
can never persist and lose them on the restart it cannot avoid.

**Reads returning `undefined` while writes fail.** Rejected for the reason in the
abstract; it converts a visible failure into silent data loss.

**Auto-reopen on `InvalidStateError`** (`db.close()`, clear the cached promise, retry
once), listed as optional in the issue. Rejected: on a full disk the reopen fails too,
and a self-healing storage layer makes it harder for the app to fail closed. Sticky
classification plus an explicit restart is the clearer contract.

**Patching `patches/loro-repo.patch`** to classify inside the library, which the issue
suggested for speed. Rejected: `StorageAdapter` is a public interface and every method
is `async`, so a bare synchronous `db.transaction()` throw already surfaces as a
rejection the wrapper sees. Patching the published `dist/` (two builds) would have to be
re-applied on every version bump for no user-visible gain.

### Known limit

`classifyStorageFailure` matches DOMException `name` first but falls back to message
regexes, and that prose is not stable API across engines or locales. Upstream work was
opened against `loro-dev/loro-repo` to attach a stable `code` to storage errors and to
stop `loadDoc` requiring `readwrite`; once it lands, the fallback can become
compatibility-only. Until then a differently worded engine message would be treated as
unclassified — which fails safe, in that the app keeps its previous behavior rather than
latching wrongly.

## Verification

3208 component tests (27 new, covering classification, cause-chain walking, fail-closed
reads, and the recovery screen's actions), 79 Electron tests, typecheck, lint, i18n, and
the public/platform/code-collab boundary guards. The disk-full condition itself was
reproduced from fixtures rather than a real full volume; no manual end-to-end run on an
exhausted disk was performed.
