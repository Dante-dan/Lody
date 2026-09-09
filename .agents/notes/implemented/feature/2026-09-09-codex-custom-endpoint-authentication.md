# Codex Base URL and API Key setup

Status: implemented
Translation: pending

## Abstract

Codex setup offers ChatGPT device login and a Base URL + API Key mode in onboarding and
Settings. The custom mode uses a generated Responses API provider while keeping its credential
on the execution host.

## Decision

Workspace state stores only non-secret provider metadata. The renderer passes the API key through
the existing encrypted ACP authentication-input exchange. The target CLI stores it under
`provider-credentials` with owner-only permissions and binds it to the complete launch-relevant
configuration. Capability probes and sessions inject the key only on an exact binding match.

The provider uses a Lody-owned environment key and a separate ownership marker. The marker records
the previous `model_provider` selector so switching back to ChatGPT is reversible without
copying an existing `CODEX_API_KEY` or reserved provider into Lody state. Invalid JSON and
namespace collisions fail rather than being normalized or overwritten.

The feature requires a negotiated `codexCustomEndpointCredentials` capability. Its setup row
starts in `awaiting-auth`, receives no secret, and enters the existing setup saga only after the
target CLI has stored and verified the credential. Remote HTTP endpoints are rejected; HTTPS and
loopback HTTP are accepted.

## Failure and cleanup

A failed live probe restores the prior local credential record. Create failure cancels the setup,
and setup cancellation removes the local record on the target daemon. Switching to ChatGPT or
deleting the provider first removes the generated metadata and triggers a machine refresh, whose
launch resolver deletes the now-unreferenced credential before the durable config is removed.

## Evidence

The [draft specification](../../../../specs/codex-custom-endpoint-authentication.md) owns the
behavior. Shared tests cover endpoint policy, reversible overlays, collision rejection, malformed
configuration, and setup-row rejection. CLI tests cover secret interaction, local storage,
rollback, and binding mismatch. Component tests cover the one-shot payload and the actual Flock
writer boundary. A controlled loopback relay run with bundled Codex 0.153.4 observed a streamed
`POST /v1/responses` request with the configured model and matching bearer credential; the relay
returned an intentional 401 after recording only the boolean credential match.
