# Preserve declared business fields across history writes

Status: implemented
Translation: current

[中文](2026-09-08-history-writer-business-fields.zh.md)

## Abstract

Review of PR #460 at `71cbb22e` found that the shared writer dropped accepted-steer
provenance and rejected valid permission enrichment because it reparsed untouched
old tool content. History config now explicitly owns steer provenance in both new
input parsing and read normalization. Tool state and descriptive metadata share
field parsers derived from the existing tool message definition, while content or
identity edits still require complete item parsing. The separate imported-history
hash mismatch remains unresolved; these repairs are not whole-PR merge approval.

## Responsibilities

This extends the [single-writer decision](../architecture/2026-09-07-single-history-writer.md),
not the storage layout. The existing callback adapter still enters the same writer;
there is no second materializer, old-document migration, or global validation bypass.

`SessionHistoryInputConfigSchema` declares `_lodyDeliveryKind: 'steer'` without
inventing an ACP request option. The stored/read type derives that field's value
type from its parser. The actual read normalizer preserves the marker, so edit
eligibility can reject a steer before provider preparation as well as before commit.
Closed new-input objects still filter unrelated unknown keys.

The tool message schema owns status, title, kind, locations and permission request
field definitions. A narrow picked group reuses those validators; only changed
fields are parsed. The tool identity and payload must stay equal to use that path.
Outcome-only replies still preserve old request information. Bad new metadata or
content rejects the entire command before CRDT operations; a later valid command
can proceed. This is not acceptance of new opaque tool content.

## Corrected review evidence

An initial steer service probe replaced `getHistory` with raw Mirror data. That
incorrectly suggested the base rejected before provider preparation. Actual base
`getHistory` normalized away the marker too, but the raw history callback rejected
again before replacement. Exact-base service plus the actual reader confirmed the
head lost that final protection because the marker was absent from storage itself.
Both services can wake dispatch in `finally`; that is not evidence of a new prompt
being executed. The permanent regression now uses the real reader and writer.

## Verification

- The six real permission producer regressions failed before repair and passed
  afterward. Two additional content-change rejection tests retain CRDT values and
  version. They cover two real replicas and unchanged nested container identities.
- Steer tests cover new writes, peer snapshots, read normalization, invalid marker
  rejection, and actual execution-service ownership transition followed by the real
  edit-and-resend service. Type contracts reject an invalid marker at compile time.
- Provider/network and disk durability are not established by these local tests;
  no captured user transcripts or 3000-turn product acceptance is claimed.
- Full `pnpm check` passed (typechecking, lint, repository tests, i18n and boundary
  guards), as did documentation checks and changed-file formatting. Independent
  review found no new P0/P1 in these two repairs; the hash P1 remains open.

## Pending hash decision

The importer records source hashes while new writing can project a different value.
Accepting either raw or projected content cannot distinguish legitimate new storage
from a legacy user edit that deletes exactly the projected-away field. Do not ship
that ambiguity as proof of strict conflict detection. A proposed baseline must bind
stored hashes to the doc cursor's own source hashes; adding that durable metadata
requires an explicit decision. No such format change is included in these repairs.

Contract: [draft Spec](../../../../specs/session-history-writes.md).
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
