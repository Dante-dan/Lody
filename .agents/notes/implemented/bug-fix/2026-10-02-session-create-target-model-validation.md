# Validate frozen Session create options against their target model

Status: implemented
Translation: current

[中文](2026-10-02-session-create-target-model-validation.zh.md)

## Abstract

A Session create accepted a semantic reasoning selection for a non-probed model but rejected the same concrete options during durable materialization. The probe's effort list describes a different model, so the rejection prevented Session creation until the Operation deadline. Create validation now recomputes target-model effort and Fast exemptions from the stored model and options, using the same policy as chat validation. Existing frozen Operations and Role creates benefit without a storage migration; unknown target capabilities remain subject to runtime validation.

## Decision

Issue [#1215](https://github.com/LodyAI/Lody/issues/1215) identifies the mismatch between semantic acceptance and concrete replay. `resolveEffectiveSessionCreateDispatchConfig` merges the semantic resolver's validated IDs with `validateModelDependentTurnConfigOptionValues` before checking snapshot options. Top-level model selection takes precedence over the model option, matching dispatch. Declared target constraints and unrelated option validation remain enforced.

Persisting ephemeral validated IDs or semantic run config would require a schema change, miss already accepted Operations, and leave concrete Role selections inconsistent. Recomputing from existing fields covers all three paths. This restores the existing model-dependent validation contract; no Spec intent changes. Deterministic retry classification and the composer menu are separate concerns and unchanged.

## Verification

The owning Session command suite exercises actual `prepareSessionInput` with a synthetic machine capability row: semantic creation followed by JSON-frozen concrete replay, Role-style model options, rejection for probed or declared invalid effort, and unknown-option rejection. Live Devin ACP and daemon retry scheduling are not exercised; the shared preparation boundary is covered.
