# Engine turn origin within the assistant row

Status: proposed
Translation: current

[中文](2026-10-03-engine-turn-origin-cue.zh.md)

## Abstract

Engine-opened assistant turns need a visible reason without shifting later navigation targets. This reference change puts a translated origin cue inside the first existing assistant row, using only persisted `cron_job` and `task` values. It adds no stream item or virtual row and does not reveal the triggering prompt. The reference depends on the unmerged history contract in PR #654; current main has no persisted origin field, so this is not a main-compatible runtime delivery.

## Decision and boundary

[Issue #660](https://github.com/LodyAI/Lody/issues/660) records the rejected divider: inserting a stream item changes the relationship between history and chat indexes. [PR #654](https://github.com/LodyAI/Lody/pull/654) reverted that UI and proposes persisted `acpTurnOrigin`. This branch retains its authors' commits as a dependency and changes only the UI consumer. It does not reimplement engine routing or claim adoption of that contract.

Known origins receive “Scheduled task” or “Background task”; unknown and absent values stay unlabeled. A first-row flag follows the existing expanded/collapsed layout, so the cue occurs once without another virtual row. The stream cache compares the persisted origin because a history entry can change in place. Reloaded history uses the same field, without inferring origin from nearby user turns. The [Spec](../../../../specs/engine-turn-origin-affordance.md) remains draft.

## Evidence and validation

Main `5a0729be9d728dc6a1be34e9b20f975a453e3e23` has no `acpTurnOrigin` in history schema, history apply, session domain or stream builder. Reference base #654 is `0a98b773b2be35ef5f529fa8c8e6d4d65de25e37`; its history-write schema accepts an optional string and its stream builder carries it to messages. Tests extend the owning stream and row suites to cover two engine turns before a later user, reloaded metadata, in-place cache invalidation, and unchanged row keys/indexes. The two owning suites passed 32 tests, including translated label rendering. Scoped lint had no errors; i18n and docs checks passed. Full format passed after restoring the reference submodule revisions. Desktop/app runtime and provider-generated engine history have not been exercised; the suite uses repository fixtures. Full check and components typecheck were attempted separately and are not claimed as passed. Storybook covers known, absent and unknown origins.
