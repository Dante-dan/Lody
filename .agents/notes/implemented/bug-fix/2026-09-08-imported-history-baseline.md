# Separate source hashes from stored history

Status: implemented
Translation: current

[中文](2026-09-08-imported-history-baseline.zh.md)

## Abstract

The new history writer can filter legal provider extension fields, so importing
history and later comparing its stored hash to the original source hash incorrectly
blocks refresh. Imports now retain source hashes and ids while recording a separate
stored-content baseline in the document cursor. Existing content is compared exactly,
including legacy fields, so deleting a field cannot masquerade as normal filtering.
This adds optional cursor metadata; it neither migrates old bodies nor makes old
importer binaries understand the new baseline.

## Ownership and alternatives

The importer owns hashing, not HistoryWriter or Mirror. The existing writer still
owns history writes. SessionDocument provides a synchronous history-write/capture/
cursor sequence with no awaited gap; repo persistence and transport remain separate
completion boundaries. The baseline contains hashes of role/items/plan only, matching
the existing hash scope, not arbitrary turn metadata.

The versioned baseline is encoded as one primitive JSON string to prevent CRDT
field-by-field merging of two records. It is bound to the document cursor's source
hash digest and length. Unknown/corrupt/stale baselines fall back to exact source
comparison, never a permissive match. Legacy source hashes and generated ids do not
change. Successfully checked legacy prefixes remain byte-for-byte values with their
existing containers while new suffixes use the current writer.

Accepting either raw or sanitized existing content was rejected: a user's deletion
of exactly the filtered field would become indistinguishable from a new write.
Rehashing every old body would be a migration and change import identity. Instead,
only a successful guarded import/refresh or explicit conflict replacement records
the actual stored baseline. A source digest match no longer skips the content check;
deleted imported turns now conflict rather than being silently restored.

## Evidence and limits

The permanent real SessionDocument/LoroRepo regression failed before the repair:
legal ACP `locations.endColumn` caused the second import to conflict. It now appends
the next source turn. Additional tests cover legacy fields/CIDs, field and turn
deletions, local appends, stale cursor baselines, independently advanced conflict
metadata, a peer edit at the write boundary, snapshot/reopen and old cursor readers,
plus explicit conflict replacement and repeated resolution.

A peer's body can arrive before its cursor. Only the incoming source suffix is
parsed to predict that suffix's stored hashes; the existing imported prefix is
never reparsed. Matching an exact already-arrived suffix advances the cursor without
duplicating rows. A rejected history command leaves both history and cursor unchanged.
The focused suite passes 44 tests (14 real-writer integration cases and 30 existing
decision/persistence cases); fixtures are synthetic.
Full `pnpm check`, final CLI typechecking, changed-file formatting and documentation
checks also passed. This is local verification, not merge approval.

These tests stub the provider and remote confirmation. They are not real disk-crash,
network, old released application, or 3000-turn acceptance. Old importers may still
conflict on projected content; the extra baseline is reader-compatible, not an
unconditional downgrade guarantee. History and cursor writes are ordered local CRDT
operations, not a new distributed transaction or cross-object durability guarantee.

This resolves the pending hash decision in [business-field repair](2026-09-08-history-writer-business-fields.md).
Contract: [draft Spec](../../../../specs/session-history-writes.md).
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
