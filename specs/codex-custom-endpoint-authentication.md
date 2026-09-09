# Codex custom endpoint authentication

Status: draft
Translation: pending

## Scenario

A user setting up Codex may authenticate with ChatGPT, or may have an API key for an
OpenAI-compatible gateway. Onboarding and Settings must expose both choices in the Codex
provider form. The gateway path requires a Base URL and API Key and must state that the
endpoint needs to support the OpenAI Responses API.

## Behavior

ChatGPT remains the default and retains the existing device-login flow. Choosing Base URL +
API Key creates a Codex custom model provider that routes requests to the supplied URL, reads
its secret from `CODEX_API_KEY`, uses the Responses wire API, and does not require OpenAI
account authentication. Provider verification must use the persisted draft containing those
exact values; an authentication result from another configuration is not sufficient.

The dedicated form owns only the provider entry it generates. It may not expose its API key
inside `CODEX_CONFIG`, allow the additional-environment editor to override its managed keys,
or rewrite unrelated fields and providers in an existing valid `CODEX_CONFIG`. Returning to
ChatGPT removes only the generated provider and its key. Arbitrary hand-written Codex
configuration remains an advanced environment override.

The custom endpoint changes authentication and request routing, not runtime ownership. Lody
continues to install and manage the same Codex runtime unless the user separately supplies a
runtime binary override.

## Evidence

- [Shared Codex provider configuration](../packages/shared/src/codex-provider-config.ts)
- [Provider form](../packages/components/src/components/settings/agent-config-dialog.tsx)
- [Codex adapter runtime options](../packages/acp-extension-codex/README.md#runtime-options)
- [CLI authentication lifecycle](../apps/cli/src/agent/README.md#authentication)

This revision records the requested integration as a draft; it has no linked human approval
of the specification revision.
