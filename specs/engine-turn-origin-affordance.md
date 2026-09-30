# Engine turn origin affordance

Status: draft
Translation: current

## Scenario

A scheduled task or a background task wakes an agent without a new user message.
When that work appears as its own assistant turn, a reader needs to understand why
it appeared between ordinary turns. The origin cue belongs to that assistant
turn, including after the conversation is reopened.

## Proposed behavior

- Show a short origin label within the assistant turn's own row. A scheduled
  wake shows “Scheduled task”; a task wake shows “Background task”. Unknown
  origins do not receive a guessed label.
- Derive the cue from the persisted turn origin, rather than from arrival time,
  nearby user messages, or the current runtime state. The cue remains the same
  after history reload, virtualized remount, and sharing when that history field
  is present in the shared representation.
- Keep the same conversation order and do not add stream rows. The origin label
  is part of the assistant row; it is not an additional message, divider, or
  virtual-list item. Search and outline jumps continue to target the correct
  turn when several engine turns precede the target.
- Do not display a private triggering prompt as part of this first change.
  Whether such text is safe and useful to show requires a separate decision.

This draft assumes the engine-turn history work in #640 and PRs #653/#654 is
available. It does not approve or specify their routing, lifecycle, or persistence
design. If that work changes, review this draft against the resulting history
contract before implementing the cue.

## Acceptance examples

1. A persisted `cron_job` origin shows “Scheduled task” inside its assistant
   turn; a `task` origin shows “Background task”. An ordinary assistant turn
   shows neither label.
2. With two engine-opened turns before a later user turn, search and outline
   navigation still scroll to the requested turn. No new stream row appears.
3. Reloading the same persisted history retains the label. A history entry
   without a known origin remains visually unchanged.

## Open questions

- Should a future approved design expose the triggering cron prompt? This
  proposal deliberately leaves it out.
- What origin values, if any, beyond `cron_job` and `task` should have public
  labels? Unknown values should remain unlabeled until defined.

## Evidence and status

- Request and prior divider failure: [issue #660](https://github.com/LodyAI/Lody/issues/660),
  [PR #654](https://github.com/LodyAI/Lody/pull/654).
- Engine-turn history proposal: [issue #640](https://github.com/LodyAI/Lody/issues/640),
  [PR #653](https://github.com/LodyAI/Lody/pull/653). At the inspected main
  commit `1cf6928b`, `acpTurnOrigin` is not present; #653 is closed without a
  merge, while #654 remains open. This is a dependency, not executed validation.
- Current row construction and jump paths: `packages/components/src/components/ai-gui/build-chat-stream-items.ts`,
  `packages/components/src/components/sessions/session-chat-interface.tsx`, and
  `packages/components/src/components/ai-gui/AGENTS.md`. These were inspected
  statically; no engine-turn UI behavior was run for this draft.
