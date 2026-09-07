# Session history writes

Status: draft
Translation: current

[中文](session-history-writes.zh.md)

## Scenario

A synchronized session contains an unknown future item, or a damaged old text
item. Sending a valid user turn and streaming a different item must still work.
That tolerance must not authorize creating new malformed items locally.

## Contract

- Renderer and CLI share one HistoryWriter for local history changes. A reader
  feature flag may replace the view, not the write contract.
- New turns use explicit message types and runtime input parsing. Legacy typed
  callback callers use the same writer through the session facade.
- Before a command changes history, validate its new turns and changed known
  fields/items. Reject invalid commands with paths/codes, retaining prior values;
  another valid command remains usable. Do not validate unrelated stored items.
- Filter unknown fields on closed new-input objects. Explicit protocol extension
  dictionaries remain JSON-valued. Preserve unknown stored fields and untouched
  unknown/damaged items; reading is not a migration or permission to scrub data.
- Existing primitive strings remain primitive; existing Text edits retain their
  container identity. Storage-layout changes are separately reviewed.
- Acceptance here means a local CRDT write. Existing repo persistence and transport
  still own durability, permissions, and remote synchronization.

## Limits and review questions

This is not a proof of arbitrary cross-version application compatibility or reader
safety. TypeScript cannot enforce untrusted inputs, semantic string constraints,
or prevent deliberate casts/raw access. A command changing an already damaged item
may need to repair that item; it cannot rely on tolerance reserved for untouched
history. The initial callback adapter supports order-preserving history edits, not
arbitrary reordering of existing turns in a plain LoroList.

The current full-Mirror read path still materializes history; this change is not
the 3000-round performance acceptance or the windowed ConversationView rollout.
Non-history control-field validation remains outside this HistoryWriter contract.

## Implementation evidence

- `packages/shared/src/{history-writer,history-write-schema,session-mirror}.ts`
- `packages/shared/tests/history-writer.test.ts` and `history-writer.contract.ts`
- [Decision](../.agents/notes/implemented/architecture/2026-09-07-single-history-writer.md)

Draft for human review; implementation and passing tests do not grant Spec approval.
