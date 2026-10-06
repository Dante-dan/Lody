# Renderer Repo storage crisis boundary

Status: proposed
Translation: current

[中文](2026-10-06-renderer-storage-crisis.zh.md)

## Abstract

A failed renderer IndexedDB connection can repeatedly reject session creation even
when disk space has been freed. The current library classifies failures, but the
application has no Repo crisis owner. This proposal separates storage observation,
pre-mutation fencing and user-directed shutdown; a storage-only wrapper cannot
promise fail-closed application behavior. The bounded first delivery excludes
filesystem cleanup and cross-renderer atomicity. Only source inspection and
document validation are recorded here; the behavior is not implemented or tested.

## Inspected evidence

Inspected main `86e0da5ee125d911d097210dda6ac4d382230c1a` for
[#417](https://github.com/LodyAI/Lody/issues/417). The author's
[upgrade finding](https://github.com/LodyAI/Lody/issues/417#issuecomment-5855033825)
states that loro-repo 0.20.3 classifies synchronous transaction failures, leaves
reconnection to the application and can report upgrade failures as `unknown`.
Do not restore the superseded local library-classification patch proposal.

`create-workspace-runtime.ts` composes a plain `IndexedDBStorageAdaptor` at the
Repo boundary and passes it to `createSessionSnapshotLoader`. No app-level
`RepoStorageError` or storage crisis handler was found in current public source.
The snapshot loader catches seed-save failures and returns persisted state, so
crisis observation must happen below that catch. Current `startSession` writes
metadata before acquiring/writing a session, and Flock operations mutate live
handles. Blocking only the landing toast or `startSession` leaves other paths
writing; blocking only persistence can leave apparently accepted in-memory edits.

The cursor store's degraded memory fallback serves rebuildable checkpoints, not
Repo source data. Existing renderer fatal recovery handles render/process failure,
not asynchronous storage failure. Electron shutdown preserves unsaved-document
vetoes and CLI ownership; force-exit would violate that existing boundary.

## Decision and alternatives

Propose a sticky runtime crisis owner, adapter-level observation and rejection,
pre-mutation guards, and a recovery surface outside workspace initialization.
Use typed quota/unavailable codes and preserve unknown failures as unknown.
Keep normal user-directed quit and never promise rollback of in-flight work.
Intent and validation criteria live in the
[draft Spec](../../../../specs/renderer-storage-crisis.md).

Reject a chat-only toast fix: it leaves archive, Flock and background writes alive.
Reject an in-memory Repo fallback: it hides durability loss. Do not add automatic
reopen: the author asks for explicit quit/relaunch and current source provides no
proof a reopened connection preserves the failed runtime's state.

## Verification and remaining work

The source trace is static evidence, not a real disk-full reproduction. Implement
and validate the guards and recovery UI in the owning suites before claiming the
issue fixed. Preserve the bootstrap seed-save failure signal, reject new live
mutations, and exercise Stay/Leave through normal shutdown. The draft Spec does not
claim linked human approval; no implementation-before-approval restriction was
found in current root/Spec guidelines. Fork PR publication separately requires a
valid linked issue and the user's actual public Context handoff choice.

## Reference implementation checkpoint

The reference branch wires a typed sticky crisis through StorageAdapter methods
and replica checkpoint stores, with WorkspaceWriter checks before acquisition
and after awaited acquisition. The owning `workspace-writer.test.ts` suite passed
15 tests, including quota/unavailable fencing, a failure during pending acquisition
and unknown-error preservation. The blocking recovery UI, user quit action and
background activity suspension remain unimplemented; this is not the full Spec
or a cross-window/in-flight rollback guarantee.

## Automatic contribution stopped

Publication preflight subsequently found the still-open competing implementation
[PR #438](https://github.com/LodyAI/Lody/pull/438), head
`5a4978c1255a5db5d218b4a54d71207b00789a97`, authored by `app/lodystage`.
It already covers Phase 1 crisis detection, the blocking recovery screen and
restart/quit. This reference is retained as an unfinished recovery checkpoint,
not submitted as a competing contribution. No completed issue fix is claimed.
