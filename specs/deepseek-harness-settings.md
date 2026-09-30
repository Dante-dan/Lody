# DeepSeek Harness user settings

Status: draft
Translation: current

[中文](deepseek-harness-settings.zh.md)

## Behavior

Users can configure settings-aware Harness plugins in `settings.yaml` under
`DSH_HOME`, defaulting to `~/.dsh`. Lody's built-in DeepSeek ACP composition must
mount the upstream file settings provider and preserve the user's document.
Absent settings retain composition defaults. Malformed documents fail startup with
an error; the host must not silently overwrite or discard them.

An unavailable `agent-presets.default` must not strand a session when the standard
preset is usable. At ACP session creation, preserve a usable default, including
custom presets; otherwise select the usable `standard` preset and log a warning.
Persist and return the actual selection without rewriting user settings. This
also applies when the host creates a replacement connection for an existing
conversation. Explicit preset switches remain strict. If neither the configured
default nor `standard` is usable, fail with repair guidance before creating an
Agent; do not choose an arbitrary composition or change permission settings.

The upstream plugin owns configuration schemas and override semantics. In
particular, `llm-deepseek.models` replaces the local catalog array in full.
Settings updates are observed by the provider, but ACP catalogs remain scoped
to a connection: users refresh capabilities and open a new connection to obtain
updated choices. This does not promise live selector updates in existing sessions.

A user may also configure supported `llm-pi-ai.providers` routes in the same
Harness settings document. The built-in Harness agent exposes each configured
provider and model in its ACP selector. A selection retains the exact provider
and model identity even when two providers use the same model ID; requests use
that route's protocol. Credentials come from a documented Harness-supported
reference such as `apiKeyEnv`, remain outside generated profiles and shared
workspace data, and are never copied into ACP capability metadata. Missing
credentials or unavailable routes fail clearly without switching to another
provider. Settings changes become visible after capability refresh and a new
connection, without promising a live update to an existing session. Existing
DeepSeek configuration remains usable when no custom route is configured.

An explicit `DEEPSEEK_BASE_URL` retains endpoint-driven model discovery. Local
catalog additions are not merged into the endpoint's `/models` response by this
change. Credentials remain host environment inputs, and generated compositions
must not embed them. No product UI or telemetry service is introduced.

## Evidence

- [Extension composition](../packages/acp-extension-dsh/src/profile.ts)
- [Extension settings documentation](../packages/acp-extension-dsh/README.md)
- [Host launch wrapper](../apps/cli/src/agent/deepseek-harness-runtime.ts)

This revision records the settings and provider-route integration as a draft; it has no linked
human approval of the specification revision.
