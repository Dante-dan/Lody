# Shared contracts

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

## Session history

- Session history storage tolerates unknown string item types from newer peers without
  rewriting them or blocking unrelated writes. Keep known-type guards and external-input
  parsing; `tests/session-doc-forward-compat.test.ts` covers this separately from unknown root keys.
