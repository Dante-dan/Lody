# Shared contracts

`CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` only.

## Session history

- Session history storage tolerates unknown string item types from newer peers without
  rewriting them or blocking unrelated writes. Keep known-type guards and external-input
  parsing; `tests/session-doc-forward-compat.test.ts` covers this separately from unknown root keys.
- `createSessionMirror` is the renderer/CLI session entrypoint. Its `HistoryWriter`
  owns local history writes, including legacy callback updates; no raw history writes
  or second Mirror writer. Read-path feature flags must never change this owner.
- Validate new turns and changed known fields/items before applying a command, never
  unchanged history. Invalid commands preserve the old values and throw content-free
  diagnostics; they must not leave partial history writes. Keep stored unknown fields
  and unchanged opaque items; do not sanitize/rewrite a whole stored document.
- New inputs use the shared message parsers. Known protocol extension dictionaries
  retain JSON data, not arbitrary JS objects. Storage layout stays separate: coordinate
  any `Any.storageSchema` adoption with its Mirror patch, including rollback.
  Rationale: [single writer](../../.agents/notes/implemented/architecture/2026-09-07-single-history-writer.md).
- Parser coverage must include nested discriminators (`system_notice.name`) and
  correlated metadata, not just item `type`. Fork regression tests must cross the
  actual SessionDocument/HistoryWriter boundary; a mock updateHistory cannot prove it.
- Copying stored history uses a writer-captured snapshot, never a caller-supplied
  "trusted" array. Preserve unchanged opaque content; parse authored changes and new
  notices. Prepend copies to target initialization rows without replacing their containers;
  reject colliding ids. Rollback rejects intervening history changes except pending-to-seen
  read acknowledgement on newly inserted user rows. External ACP imports remain new input.
- Tool status/request-only edits parse changed state fields, not untouched stored payloads.
  Changing other tool fields still uses the complete item parser.
