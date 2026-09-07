# One history writer before windowed readers

Status: implemented
Translation: current

[中文](2026-09-07-single-history-writer.zh.md)

## Abstract

Disabling whole-session validation restored sending, but also admitted malformed
new items. PR #460 now extracts the local writer/materializer from #376 into the
shared package and routes renderer and CLI history writes through it. It parses
new turns and changed fields/items before applying a command while retaining
unmodified incompatible history. This is a write-boundary repair, not the windowed
reader rollout or a claim that every consumer can safely interpret future data.

## Ownership and reuse

Verified remote heads before extraction: #376 `cc49d259`, #460 `15395c6c`.
The schema-aware materializer and minimal field diff come from #376, rather than
creating another storage encoding. The writer no longer depends on ConversationView;
the future #376 rebase must import this shared writer and remove its local writer
and Mirror rollback writer. This PR does not modify that sibling branch.

```text
Renderer WorkspaceWriter ─┐
CLI / typed callbacks ────┼─ HistoryWriter → minimal Loro operations
                         │   ↑ new/changed input parsing only
Session Mirror read side ┘   old untouched history is not reparsed
```

`createSessionMirror` is the shared compatibility facade: existing callback
producers are evaluated once and their history delta is preflighted before any
control write. Mirror still reads the full document, but never authors the history
delta. Direct CLI field setters use the writer too. Operation progress duplicate
rows are resolved using existing row identities, without a raw aliasing commit.
The CLI's startup history sanitizer is removed: opening an existing session must
not rewrite notice metadata or make those old records pass the new-input parser.

## Input versus stored data

The existing message parsers now cover missing production variants (subagent tasks,
comment/visual references and text spans), normal ACP permission/location fields,
and file transport relationships. Operation completion schemas move from the CLI
store into shared contracts and are reused by history parsing. `system_notice`
name/meta is a correlated TypeScript union. Normal producer APIs no longer erase
history entry types to `Record<string, unknown>`.

The new turn parser and its inferred type do not replace every legacy read type:
for example, an existing image read type accepts arbitrary MIME strings while new
input parsing enforces supported MIME values. Compile-time tests cover malformed
messages, role/status field types, name/meta associations and parser variant coverage.

Malformed commands throw content-free paths/codes before their history changes;
old values remain. This does not isolate good fields inside the same rejected
command. Closed new-input objects discard extra keys; explicit open protocol
dictionaries keep JSON. Unchanged old items bypass parsing, and unknown stored
fields survive updates. Non-history control validation is not repaired here.

## Compatibility and remaining work

- No stored-document migration, image stripping, attachment externalization or
  hash-format changes. #443 and #359 remain independent later work.
- Existing Text/primitive representation is preserved on string edits. The
  extracted materializer retains #443's optional storage-hint support; schema
  hints and the Mirror patch must still be adopted/rolled back together.
- There is no writer feature flag. Future read-path rollback must use this writer.
- Callback history edits preserve existing turn order; arbitrary reorder is
  rejected. Import/append, deletion, duplicate cleanup and scalar/text changes
  retain existing turn containers.
- Full-Mirror reads and legacy callbacks can still do O(total) work. Real desktop,
  mobile and 3000-round acceptance is not established.

## Evidence

Real Loro tests cover unknown and damaged history, live import/snapshot reopen,
append/stream updates, old-value retention on invalid commands, preflight before
control writes, JSON-only opaque payloads, concurrent convergence, container IDs,
and new-write operation parity with Mirror. CLI and renderer tests cover their
actual writer integration and progress-duplicate recovery. Type tests are included
in the normal shared `tsgo` run, not merely transpiled by Vitest.

Validation: `pnpm check` passed outside the socket-restricted sandbox; the first
sandbox attempt hit `listen EPERM` in unchanged local IPC tests, whose separate
unrestricted rerun passed 9/9. The final focused shared set passed 77 tests, renderer
send/writer tests passed 32, and CLI startup/dispatch tests passed 5. Changed-file
formatting, typechecks and `pnpm run docs check` passed. These are synthetic local tests,
not real old application builds or desktop/mobile end-to-end acceptance.

## Correction: fork notice coverage

Review of `f0c55094` found a production-path regression: TypeScript allowed the existing
`session_fork_origin`, but the shared parser lacked that name. The original coverage
assertion checked only item `type`, so it missed the nested discriminator. The 27
fork tests mocked `updateHistory` and passed while both real fork paths failed.

The repair adds the correlated fork-origin metadata schema without relaxing unknown
new notice names. Compile-time checks now compare notice names and complete correlated
notice types in both directions. Two service regressions use the real SessionDocument,
session facade and Loro writer for regular/worktree forks; they failed before the
repair and passed afterward. Worktree completion uses fake immediates and an explicit
marker-cleanup signal. A writer test rejects malformed metadata without CRDT changes
and checks a valid notice round trip. Provider execution and disk persistence remain
stubbed; these tests establish the local write boundary, not end-to-end fork durability.

The main merge preserves its progress no-op guard together with shared HistoryWriter
ownership. No old history migration or whole-state validation is introduced.
After merging `main@d366a5a6`, `pnpm check` and documentation checks passed; the
focused fork/progress suite passed 49 tests and the writer suite passed 14.

## Correction: copying stored history is not authoring new input

At `cf0af8b4`, appending to a history with unknown items worked, but forking that
history still failed: an empty target made every copied turn look new. Known items'
unknown fields were silently filtered in the target. Edit-and-resend rollback had
the same problem when reinserting a removed tail. Source documents were not rewritten.

The same HistoryWriter now captures raw document history into an in-process snapshot.
A private WeakMap authenticates the handle; its public history getter returns a detached
copy, so caller mutation cannot change the trusted baseline. `copyFrom` preflights
changes against that baseline and uses the existing materializer on an empty target.
It retains stored unknown data but parses newly authored fields/items/notices. Both
fork paths carry the frozen source snapshot through their existing durability saga.
No permissive parser flag, arbitrary trusted-array constructor, or second writer is added.

`updateWithRollback` captures the before/after history and returns a one-use local
receipt. It restores old values without new-input parsing, retains surviving turn
containers, and refuses to overwrite intervening history edits. Removed turns get new
containers when restored. This does not repair concurrent metadata rollback or provide
crash recovery. External ACP materialization/import remains on the strict authoring path.

Real Loro regressions cover opaque copy, invalid new/changed input with no partial writes,
forged/mutated snapshot handles, non-empty targets, reopen, unchanged source, and peer
edits invalidating rollback. Regular/worktree fork and edit-and-resend tests now cross
the real SessionDocument/facade/writer boundary, including failed-commit restoration.
The old edit test supplied an invalid new image input (`key` without `imageId`/`sizeBytes`);
the integrated test uses the actual input contract while retaining opaque old fixtures.
Provider/disk operations remain stubbed. Copying a damaged item that the fork explicitly
modifies (for example attachment metadata) still requires that changed item to parse;
this is not arbitrary reader compatibility. Snapshots/copies are full-history work,
not the 3000-round performance acceptance, and container IDs are not portable between docs.

Validation for this correction: `pnpm check` passed, including shared/CLI/component
typechecks and the full repository test suite. Focused coverage passed 16 writer tests
and 35 fork/edit service tests. These results do not establish real provider execution,
disk-failure recovery, or old application build interoperability.

## Correction: initialization, read acknowledgement, and tool state

Review of `d3f91aad` exposed omitted production side effects. Worktree setup can
write a script log before fork copying, so requiring an empty target rejected a
valid fork. Auto-read changes a new pending replacement to seen/read before an
edit-and-resend persistence failure, invalidating the rollback receipt. Tool state
updates also reparsed untouched opaque content inside an existing tool call.

The pending repair prepends copied history while preserving target rows/containers
and rejecting id collisions. Rollback permits only the new pending user row's read
acknowledgement, with all other fields unchanged. Tool state-only edits parse the
changed status/request/outcome, retaining untouched payloads; other tool edits
still parse the complete item. Tests now install the real setup recorder and
auto-read subscriber, and exercise opaque tool content with two real Loro replicas.

These regressions failed before the repair and passed afterward (17 writer tests,
35 fork/edit service tests). They do not replace independent multi-round review,
negative rollback-case coverage, real provider execution, or disk-failure acceptance.
PR #460 remains Draft. The independently based availability hotfix is
[#463](https://github.com/LodyAI/Lody/pull/463); it does not include this writer.
Before committing this repair, full `pnpm check`, changed-file formatting, and
`pnpm run docs check` passed. Independent review remains outstanding.

On this branch, supersedes the history-write portion of the
[temporary bypass](../bug-fix/2026-09-07-temporary-session-validation-bypass.md).
Intent: [draft Spec](../../../../specs/session-history-writes.md).
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
