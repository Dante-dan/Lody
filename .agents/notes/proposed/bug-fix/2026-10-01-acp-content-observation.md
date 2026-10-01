# Separate prompt content observation from replay protection

Status: proposed
Translation: pending

## Abstract

Run-config metadata emitted by a warm ACP session can make a silent prompt look successful. The no-output guard now observes agent content independently of buffered/flushed metadata, while prompt replay protection retains its conservative any-update rule. Content observation is recorded against the active turn at enqueue time and survives flushes until that turn ends. Missing transient state remains unknown and fails open. This is a reference fix for [Lody #436](https://github.com/LodyAI/Lody/issues/436), awaiting upstream review.

## Decision and evidence

`applyAcpSessionRunConfig` may emit mode/config/command notifications after a warm turn owns its assistant entry. The previous observer shared `hasPromptOutputForTurn`, so those notifications prevented the existing `agent_no_output` failure even when the adapter returned without content. Cold-session metadata without an owned target is dropped, explaining the reported warm/cold difference.

Keep two distinct questions: replay protection asks whether the adapter may have acted (any ACP update); the completion guard asks whether agent content was observed. Message/thought chunks, tools, plans and subagent events count as content; user echo, session/configuration/command metadata and usage do not. Enqueue-time ownership prevents a finalized prior turn's events from satisfying the next turn. The existing completion paths still record silent-turn failure, finalize and advance durable dispatch state; this fix introduces no replay or persisted schema.

Filtering only the pending buffer was rejected because content may already be flushed when the prompt resolves. Narrowing the replay observer was rejected because metadata does not prove safe redelivery. A turn-local flag is bounded, reset at begin/cleanup and does not add a second history owner.

## Verification

The owning ACP batching suite checks metadata-only warm turns before/after flush, unchanged conservative replay detection, content retention across flush, reset on the next turn and absent-state observation. The existing execution suite covers silent failure settlement and ordinary content completion. Validation results are recorded with the reference commit; this note does not claim human review or live provider acceptance.
