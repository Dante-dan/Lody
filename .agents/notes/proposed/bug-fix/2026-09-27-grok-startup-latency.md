# Grok startup latency boundaries

Status: proposed
Translation: current

[中文](2026-09-27-grok-startup-latency.zh.md)

## Abstract

[Issue #282](https://github.com/LodyAI/Lody/issues/282) reports a 20–50 second Grok session startup on runtime 1.0.13. The current Lody pin is 1.0.40, and the adapter's model-snapshot settlement can add at most about two seconds after the runtime reply. An opt-in adapter timing trace is proposed to separate the runtime wait, proxy settlement, and first prompt update without recording content or identifiers. A credential-isolated macOS 1.0.40 probe reached ACP initialize and returned an authentication error from `session/new`, but it did not measure the reported authenticated Windows path or a first prompt. This remains diagnosis rather than a claimed latency fix.

## Evidence and decision

- Current `main` pins Grok adapter `217688166de3b5b2bb37723537d71188a3241ec1` and official runtime 1.0.40. The adapter starts its two-second fallback only after receiving the runtime's `session/new` response. Its existing proxy tests cover the late model snapshot and fallback.
- The issue's log says `connection.newSession` itself was pending past ten seconds. Lody also builds its MCP server list before the `connection.newSession` call; the quoted pending-call log places at least part of the observed delay after that step, but lacks timestamps for runtime reply and client emission.
- The official npm `@xai-official/grok@1.0.40` was installed under an isolated `GROK_HOME`; its macOS arm64 executable SHA-256 `3f2aef9618191a2c60d18a5044fa462c9c77bdc4187b02ed716b0394e8d4fef2` matches Lody’s manifest. With no inherited credentials, a direct ACP probe returned `initialize` in 13.327 seconds and `session/new` with `-32000 auth_required` in 1.541 seconds after seven notifications; no prompt was sent. Neither the initialize duration nor the unauthenticated error locates or rules out the reported 20–50 seconds on Windows with valid OAuth.
- The [official Grok Build changelog](https://x.ai/build/changelog) says 1.0.14 moved MCP tools and other startup work to the background so new-session creation returns faster; 1.0.15 removed a repository-status scan from the first-message wait. These releases followed the reported 1.0.13 and precede the current 1.0.40 pin. The changelog does not prove that this exact Windows case is fixed.

The [reference adapter diff](https://github.com/Dante-dan/acp-extension-grok/compare/217688166de3b5b2bb37723537d71188a3241ec1...ae5b745d4fbed915ad77533b666df37d07256f5c) enables `LODY_GROK_ACP_TIMING=1` only for a redacted diagnostic run. It records elapsed milliseconds from forwarding `session/new` to the runtime reply, from that reply to client emission, and from forwarding `session/prompt` to the first client update. It emits no request IDs, session IDs, prompts, responses, or MCP details. Default behavior and protocol messages remain unchanged.

If the runtime interval dominates on 1.0.40, investigate runtime/MCP startup before changing model-snapshot settlement. If the proxy interval dominates, narrow the adapter while retaining the late-snapshot and fallback contract. This branch has deterministic timing and existing adapter tests. The official-runtime probe did not cover authenticated Windows startup or prompt streaming, so no issue resolution is claimed.
