# Isolate invalid ACP history inputs

Status: implemented
Translation: current

[中文](2026-09-08-acp-history-input-isolation.zh.md)

## Abstract

The history writer rejected future provider tool blocks and the flush queue kept
retrying deterministic validation failures. Automatic retries were already bounded,
but a subsequent notification retried the same blocked prefix. Tool blocks and
locations now have explicit JSON extension boundaries, and malformed notifications
are isolated without blocking healthy output. This does not relax top-level message
types or authorize arbitrary execution configuration fields.

## Ownership and verified repairs

- The ACP ingress parses content before enrichment inspects known fields. Unknown
  block discriminators accept JSON only; their exclusion set comes from the known
  schemas, so a malformed known variant cannot fall through into opaque storage.
- HistoryWriter validates edited/new content blocks without reparsing retained old
  blocks. Protocol extension edits can update supplied keys; absent stored extensions
  remain. Changing a block's type does not copy extensions from the old variant.
- MessageHandler isolates a deterministically rejected batch into notifications,
  reports rejected inputs using paths/codes, and consumes them. Transient failures
  retain the existing per-notification retry and rich-upload cache behavior.
- Tool `_meta` and location columns/extensions are retained. New arbitrary `env`
  keys are not session configuration; declared `configOptionValues` remains the
  option extension dictionary. Nested compile-time field checks now cover message
  items and input configuration, not just top-level discriminators.
- Import regression expectations now require preserving endColumn. Existing stored
  baselines remain relevant for old projected documents and are not migrated away.

## Evidence and limits

Real writer and MessageHandler tests cover healthy chunks before/after malformed
tool inputs, later flushes, JSON future blocks, invalid known blocks, old damaged
blocks, extension preservation and cross-variant field pollution. An isolated parser
microbenchmark (100 entries, 20 tool items each, same schema/input) measured 123–135ms
before literal-based candidate filtering and 40–45ms afterward. It is not full writer,
desktop/mobile or 3000-turn acceptance. Snapshot copies were not removed because
they enforce stored-history provenance.

Validation: repository typecheck and `check:quick` passed; shared tests passed
(1062), and full CLI tests passed (2636 passed, 4 skipped). The full `pnpm check`
stopped at one components avatar-cache assertion;
that file passed all five tests when rerun alone. The full check is not green.
Documentation and changed-source formatting checks passed.

The comment's stale rollback recovery problem remains separate: refusing to overwrite
peer edits is required, but a visible recovery path needs an explicit product choice.
This note does not claim that recovery or main-branch integration is complete.
PR: [#460](https://github.com/LodyAI/Lody/pull/460).
