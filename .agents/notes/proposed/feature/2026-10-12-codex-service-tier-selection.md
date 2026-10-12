# Codex service-tier selection

Status: proposed
Translation: current

[中文](2026-10-12-codex-service-tier-selection.zh.md)

## Abstract

[Issue #1501](https://github.com/LodyAI/Lody/issues/1501) requests distinct normal, Fast and ultrafast choices for interactive coding, retained across subsequent messages and resumed sessions. The current adapter exposes a boolean Fast switch, even though the pinned app-server schema can carry arbitrary service-tier strings. The proposed first step is a capability-driven ACP select option with exact tier values and native thread persistence, reusing existing client configuration paths. Schema acceptance is not evidence that a model, account or deployed runtime actually executes ultrafast; that boundary must be verified before advertising support.

## Inspected boundary

At Lody main `3ac76bad10f46720517a2ca6929f03de4ef5bb9b`, the Codex gitlink is `b67f2eaab63247159c8cbdbd4075334f69729daf`. In that revision:

- `FastModeConfig.ts` discovers only `additionalSpeedTiers.includes("fast")` and converts a boolean to `"fast"` or `null`. The generated `ServiceTier` alias contains `"fast" | "flex"`.
- `Model.ts` also exposes `serviceTiers` with catalog ids, names and descriptions; `additionalSpeedTiers` is deprecated. `TurnStartParams.serviceTier` accepts a string and persists it for subsequent turns. `serviceTierForTurn` is a distinct transient override; null inherits and `"default"` requests standard speed.
- New/load state reconstructs Fast with `currentServiceTier === "fast"`. A non-Fast native value therefore loses its distinct representation. Sending null must not be described as an explicit reset to standard speed.
- CLI/MCP already accept explicit `configOptionValues` and validate advertised select choices. Their semantic `fastMode` field remains a boolean; introducing a second ad-hoc transport is unnecessary for the first slice.

These are source findings, not execution of the reporter's environment. The [OpenAI API guide](https://developers.openai.com/api/docs/guides/ultrafast-mode) documents API ultrafast with different usage/cost; it does not establish a Codex ChatGPT-account or Lody managed-runtime entitlement.

## Proposed first slice

The Codex adapter owns discovery and transmission. Offer an ACP `service-tier` select only when the native model catalog supplies tier ids; preserve the existing Fast toggle for older catalogs/clients. Use advertised names/descriptions and preserve raw ids (the probed catalog uses `priority` while legacy Fast uses `fast`), a visible standard-speed reset, and an increased-cost/usage notice without inventing prices. Keep requested and native-reported tiers distinct: unknown actual tier is unknown, not a successful ultrafast confirmation.

Persist an explicitly selected tier through native `serviceTier`, restore it from thread metadata on load/resume/fork, and use `serviceTierForTurn` only for deliberately temporary choices. A model switch revalidates selection against its catalog. Reject unavailable explicit choices before starting a turn; do not silently substitute Fast. Runtime/account rejection remains a structured notice/error. Display a downgrade only when native evidence identifies the actual tier.

The host renders the advertised select and passes it through its existing configuration path. CLI/MCP use `configOptionValues` for the same id and allowed value. Legacy `fastMode` retains its documented Fast meaning and must never imply ultrafast. Any later semantic CLI shortcut needs an explicit precedence rule when both forms are supplied.

This proposal adds no capability, migration or approval guarantee. Existing private run-config drafts describe unsent UI edits, not native thread-tier durability; they should not be repurposed to promise runtime persistence. A durability/compatibility Spec change, if needed by the selected implementation, remains draft until linked human approval.

## Acceptance and remaining evidence

Behavioral adapter tests must cover catalog-driven choices, legacy Fast, invalid/model-switched choices, exact `turn/start` parameters, standard reset, and non-Fast load/resume/fork round trips. Host/CLI/MCP tests should exercise the ordinary advertised-select path and conflicting semantic Fast input. Synthetic protocol tests establish transport behavior only.

Before claiming ultrafast support, exercise a supported native runtime/model/account: discover the catalog, select ultrafast, inspect accepted turn metadata, send a subsequent turn, resume and repeat; include unsupported-runtime/account behavior. No-generation `model/list` probes using codex-cli 0.161.0 and a temporary, separately installed 0.162.1 each returned seven model entries. Each advertised only `serviceTiers: [{id: "priority", name: "Fast", ...}]` and legacy `additionalSpeedTiers: ["fast"]`; none advertised ultrafast. The adapter-installed binary reports 0.159.2. The probe used a temporary native home and a read-only link to existing authentication, then terminated and removed its temporary home. The 0.162.1 probe tests the reported version with the local account/catalog, not the reporter's environment or a paid inference request. No native generation, ultrafast entitlement, cost measurement or packaged-client UI exercise has been established. There is no upstream PR or maintainer approval for this proposal.

## Evidence

- [Pinned adapter sources](https://github.com/LodyAI/acp-extension-codex/tree/b67f2eaab63247159c8cbdbd4075334f69729daf/src): `FastModeConfig.ts`, `CodexAcpServer.ts`, `app-server/v2/{Model,TurnStartParams}.ts`.
- Host: `apps/cli/src/commands/session.ts`, `apps/cli/src/mcp/lody-mcp-server.ts`.
- [Existing draft ownership](../../../../specs/session-run-config-drafts.md).
