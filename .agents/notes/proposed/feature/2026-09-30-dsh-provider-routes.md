# Provider-qualified routes in the built-in Harness agent

Status: proposed
Translation: current

[中文](2026-09-30-dsh-provider-routes.zh.md)

## Abstract

Lody reads Harness settings, but its pinned ACP adapter exposes only one DeepSeek provider, so custom `llm-pi-ai.providers` routes remain unavailable from the existing agent. The proposed extension keeps provider/model identity through selection and execution, uses Harness credential references, and fails visibly when a route is unavailable. Adapter PR #15 now has a merged current-main implementation on its fork branch; the Lody host still pins the previous adapter and no desktop or live-provider round trip has been verified. The settings Spec remains a draft requiring human review of its intent.

## Boundary and sequence

- Keep one built-in Harness entry. Its adapter owns route discovery, selector IDs, exact model metadata, provider invocation, and clear route failure. Two providers with the same model ID must stay distinct.
- The profile mounts `dsh-llm-pi-ai` dormant. `settings.yaml` supplies supported routes and `apiKeyEnv` names a host environment input; no secret value belongs in generated files or shared workspace state.
- Host installation uses the adapter's exact package-specifier function. After the adapter PR is merged, update the Lody submodule pin; generated profile revision changes invalidate cached probes. Refresh plus reconnect reads an edited catalog. Preserve the existing DeepSeek route and explicit endpoint discovery.
- This does not add a product-specific launcher, a second Custom ACP entry, arbitrary plugins, or migration of existing sessions.

## Evidence and limits

[Lody #602](https://github.com/LodyAI/Lody/issues/602) describes the use case and explicitly distinguishes source inspection from end-to-end validation. At Lody main `1cf6928`, the submodule pin is `c5a9d4d`; its `profile.ts` lists `dsh-llm-pi-ai` in the package closure but does not mount it, and `adapter.ts` lists one provider. [Adapter PR #15](https://github.com/LodyAI/acp-extension-dsh/pull/15) now has fork head `1e63b0b`, merging current adapter main `c5a9d4d`: build, 37 unit tests, format, and diff checks passed. The pinned full-profile smoke, Lody desktop UI, and live provider request have not run on that head. The host must not claim runtime delivery until the upstream adapter merges and the host pin and integration checks are complete.

The existing [settings Spec](../../../../specs/deepseek-harness-settings.md) records intended behavior as a draft. No human approval of this revision is known. A fork-based Lody PR also requires the actual author's public conversation-sharing answer in its Context handoff; that answer must not be fabricated.
