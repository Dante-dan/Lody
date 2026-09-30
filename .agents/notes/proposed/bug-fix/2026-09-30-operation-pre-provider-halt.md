# Operation completion before-provider halts

Status: proposed
Translation: current

[中文](2026-09-30-operation-pre-provider-halt.zh.md)

## Abstract

An Operation completion can be marked handled after a memory-pressure halt even though its agent prompt never started (#1171). The proposed fix reports delivery-only pre-provider halts as `not_started`, preserving the existing claim release and bounded retry path. Ordinary user turns retain their existing failure acknowledgement. This change does not authorize replay after provider execution started.

## Decision and evidence

`SessionExecutionService.runVisibleSessionTurn` finalized every known halt with `handled`; the coordinator consumes that settlement. The system Turn is durable history, not proof of agent delivery. Use `runtime.promptStarted` and the delivery dispatch source to distinguish confirmed pre-provider failure. Extend the owning memory-pressure test for both dispatch sources.

The separate requester-idle wake defect (#1170) still needs a release-bound wake using the existing `waitForTurnRelease` barrier, plus deterministic owning-suite coverage. No change to that scheduling path is included here.

## Verification limits

The first targeted test could not collect because the Devin adapter submodule was absent. The declared submodule was initialized; the targeted memory-pressure checks passed (3 tests). The full owning suite and repository checks remain to be recorded. Formatting and docs check passed. No upstream approval is claimed.
