# Codex service-tier selection

Status: proposed
Translation: stale

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

## Reference implementation after reporter catalog evidence

The reporter subsequently supplied a codex-cli 0.162.1 catalog advertising
`gpt-6-astra` with separate `priority` and `ultrafast` ids
([comment](https://github.com/LodyAI/Lody/issues/1501#issuecomment-6120987283)).
This supersedes the earlier absence-of-catalog-evidence wait. It does not prove
server execution or account eligibility.

The adapter reference now adds a `service-tier` ACP select for models with
multiple native catalog choices and preserves raw string metadata through
new/load/fork and `turn/start.serviceTier`. `inherit` sends null; `default`
explicitly resets standard speed. Unknown selections are rejected, and a tier
that becomes unavailable after a model switch fails before native generation.
The legacy Fast control remains; changing it replaces the explicit selection.
Do not supply conflicting Fast and service-tier inputs in one CLI/MCP request.
CLI/MCP can pass the advertised choice through existing `configOptionValues`;
no new semantic shortcut or packaged UI claim is made.

Explicit choices are acknowledged through experimental `thread/settings/update`
before updating local state, then sent again in `turn/start`. Both installed 0.159.2
and reporter-version 0.162.1 experimental schemas allow its string `serviceTier`;
stable schemas omit that method. A native rejection preserves the prior choice.
`inherit` leaves native settings unchanged. Native-reported metadata is restored
verbatim without asserting the server actually executed that tier. Packaged UI and
account/runtime execution acceptance remain unverified; this is a reference, not
a claim that the full request is deployed or resolved.

## Acceptance and remaining evidence

Behavioral adapter tests must cover catalog-driven choices, legacy Fast, invalid/model-switched choices, exact `turn/start` parameters, standard reset, and non-Fast load/resume/fork round trips. Host/CLI/MCP tests should exercise the ordinary advertised-select path and conflicting semantic Fast input. Synthetic protocol tests establish transport behavior only.

Before claiming ultrafast support, exercise a supported native runtime/model/account: discover the catalog, select ultrafast, inspect accepted turn metadata, send a subsequent turn, resume and repeat; include unsupported-runtime/account behavior. No-generation `model/list` probes using codex-cli 0.161.0 and a temporary, separately installed 0.162.1 each returned seven model entries. Each advertised only `serviceTiers: [{id: "priority", name: "Fast", ...}]` and legacy `additionalSpeedTiers: ["fast"]`; none advertised ultrafast. The adapter-installed binary reports 0.159.2. The probe used a temporary native home and a read-only link to existing authentication, then terminated and removed its temporary home. The 0.162.1 probe tests the reported version with the local account/catalog, not the reporter's environment or a paid inference request. No native generation, ultrafast entitlement, cost measurement or packaged-client UI exercise has been established. There is no upstream PR or maintainer approval for this proposal.

## Evidence

- [Pinned adapter sources](https://github.com/LodyAI/acp-extension-codex/tree/b67f2eaab63247159c8cbdbd4075334f69729daf/src): `FastModeConfig.ts`, `CodexAcpServer.ts`, `app-server/v2/{Model,TurnStartParams}.ts`.
- Host: `apps/cli/src/commands/session.ts`, `apps/cli/src/mcp/lody-mcp-server.ts`.
- [Existing draft ownership](../../../../specs/session-run-config-drafts.md).


Reference validation: five existing adapter suites passed (55 behavioral tests),
including exact tier transmission/settings persistence, native rejection preserving
state, model-switch rejection, and load/fork restoration. Adapter typecheck stops
at the unchanged `ModelConfigOption.ts` import: the installed Core declaration
lacks `LodySessionConfig`. Root `pnpm check` built the adapter successfully, then
stopped at unrelated `e2ee-core` missing dependencies; the remaining root checks
were not run. Documentation check and diff whitespace validation passed. No
native inference, packaged UI, billing or actual execution-tier test was performed.
