# HistoryWriter integration with the validation hotfix

Status: implemented
Translation: pending

## Abstract

Main's temporary session-validation bypass overlapped with PR #460's shared writer
entrypoints. Integrating main keeps the writer facade in both CLI and renderer,
rather than restoring raw Mirror history writes. Main's compatibility tests remain,
and the construction-site guard also retains validation for non-session stores.
This resolves the overlapping implementations without claiming full application
performance acceptance.

## Resolution

Integration parents: PR head `76d0e9be` and main `21bd3812`. Six textual conflicts
covered two session constructors, three scoped instruction files, and the
construction-site test. The [single writer](../architecture/2026-09-07-single-history-writer.md)
supersedes the raw-constructor setup of the
[temporary hotfix](../bug-fix/2026-09-07-session-validation-hotfix.md).
Existing history is still not globally validated or rewritten. New input retains
the writer's local checks. Machine protocol and catalog rules from main remain.

The [text-event optimization](../bug-fix/2026-09-08-mirror-text-event-path.md)
and its locked patch remain unchanged. Submodules follow main's recorded revisions;
the merged frozen lockfile installs successfully. The bare-Mirror hotfix tests are
retained as dependency-level evidence, not proof that production bypasses the writer.

## Validation

The five focused suites pass 42 tests: writer, forward compatibility, text paths,
construction sites, and hotfix behavior. Full integrated `pnpm check`, formatting,
and documentation checks passed. A deterministic 3600-step patched/unpatched reader
comparison also passed, as did the real ACP entrypoint probe (20 chunks, all single-text
event batches). These are fresh integrated results, not pre-merge results.
Neither these tests nor earlier synthetic timing measurements
establish 3000-round desktop/mobile acceptance. No release or merge to main is implied.

PR: [#460](https://github.com/LodyAI/Lody/pull/460).
