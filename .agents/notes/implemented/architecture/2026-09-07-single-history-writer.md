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

Supersedes the history-write portion of the
[temporary bypass](../bug-fix/2026-09-07-temporary-session-validation-bypass.md).
Intent: [draft Spec](../../../../specs/session-history-writes.md).
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
