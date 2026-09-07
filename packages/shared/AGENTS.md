# Shared contracts

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

## Session history

- Session history storage tolerates unknown string item types from newer peers without
  rewriting them or blocking unrelated writes. Keep known-type guards and external-input
  parsing; `tests/session-doc-forward-compat.test.ts` covers this separately from unknown root keys.
- Session Mirrors temporarily use `validateUpdates: false` in both renderer and CLI.
  Do not reintroduce whole-history validation on sends; replace this bypass only with
  typed local writes covering all callers and fallback paths. External-input parsing stays.
  Rationale: [temporary bypass](../../.agents/notes/implemented/bug-fix/2026-09-07-temporary-session-validation-bypass.md).
