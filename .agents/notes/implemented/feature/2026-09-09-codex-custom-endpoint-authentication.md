# Codex Base URL and API Key setup

Status: implemented
Translation: pending

## Abstract

Codex setup previously exposed only ChatGPT device login even though the bundled adapter can
route Codex through a custom model provider. The provider dialog now offers a Base URL + API
Key mode in onboarding and Settings, persists a generated Codex provider configuration, and
uses it for the same live verification that gates creation. ChatGPT remains the default, and
manually authored Codex configuration is left intact. Custom endpoints must implement the
Responses API; Chat Completions-only relays remain incompatible with the current Codex wire
protocol.

## Decision

The existing `AgentConfigMeta.env` field remains the durable contract, avoiding a new schema or
daemon protocol version. Lody stores the secret in `CODEX_API_KEY` and stores only an `env_key`
reference, Base URL, `wire_api = "responses"`, and `requires_openai_auth = false` in
`CODEX_CONFIG`. A reserved `lody-custom-endpoint` provider id identifies the block that the
dedicated form may edit or remove. Other JSON fields and model providers survive both adding
the block and switching back to ChatGPT.

Using only `OPENAI_BASE_URL` and `OPENAI_API_KEY` was rejected for the guided path. Current
Codex configuration represents third-party endpoints as named model providers, and the
explicit `requires_openai_auth = false` setting is what prevents the adapter from falling into
ChatGPT login. Keeping raw environment editing as the only setup path was also rejected because
it is undiscoverable during onboarding and easy to configure inconsistently.

Codex is also present in onboarding's always-visible provider showcase, so a fresh user can
open the preselected credential form directly. Runtime download and ownership are unchanged.

## Evidence and limits

The intended behavior is owned by the [draft specification](../../../../specs/codex-custom-endpoint-authentication.md).
Shared tests cover configuration generation, secret separation, preservation, removal, and
authentication classification. Dialog tests cover creation-before-probe ordering, hydration,
and switching back to ChatGPT. The endpoint is validated as HTTP(S), but only the live provider
probe can establish that a particular relay implements the Responses API correctly.
