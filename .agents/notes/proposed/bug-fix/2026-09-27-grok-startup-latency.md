# Grok startup latency boundaries

Status: proposed
Translation: current

[中文](2026-09-27-grok-startup-latency.zh.md)

## Abstract

[Issue #282](https://github.com/LodyAI/Lody/issues/282) reports a 20–50 second Grok session startup on runtime 1.0.13. The current Lody pin is 1.0.40, and the adapter's model-snapshot settlement can add at most about two seconds after the runtime reply. An opt-in adapter timing trace is proposed to separate the runtime wait, proxy settlement, and first prompt update without recording content or identifiers. The reported Windows behavior and the current runtime have not been measured, so this is diagnosis rather than a claimed latency fix.

## Evidence and decision

- Current `main` pins Grok adapter `217688166de3b5b2bb37723537d71188a3241ec1` and official runtime 1.0.40. The adapter starts its two-second fallback only after receiving the runtime's `session/new` response. Its existing proxy tests cover the late model snapshot and fallback.
- The issue's log says `connection.newSession` itself was pending past ten seconds. Lody also builds its MCP server list before the `connection.newSession` call; the quoted pending-call log places at least part of the observed delay after that step, but lacks timestamps for runtime reply and client emission.
- The [official Grok Build changelog](https://x.ai/build/changelog) says 1.0.14 moved MCP tools and other startup work to the background so new-session creation returns faster; 1.0.15 removed a repository-status scan from the first-message wait. These releases followed the reported 1.0.13 and precede the current 1.0.40 pin. The changelog does not prove that this exact Windows case is fixed.

The [reference adapter diff](https://github.com/Dante-dan/acp-extension-grok/compare/217688166de3b5b2bb37723537d71188a3241ec1...ae5b745d4fbed915ad77533b666df37d07256f5c) enables `LODY_GROK_ACP_TIMING=1` only for a redacted diagnostic run. It records elapsed milliseconds from forwarding `session/new` to the runtime reply, from that reply to client emission, and from forwarding `session/prompt` to the first client update. It emits no request IDs, session IDs, prompts, responses, or MCP details. Default behavior and protocol messages remain unchanged.

If the runtime interval dominates on 1.0.40, investigate runtime/MCP startup before changing model-snapshot settlement. If the proxy interval dominates, narrow the adapter while retaining the late-snapshot and fallback contract. This branch has deterministic timing and existing adapter tests but no Windows or official-runtime measurement; no issue resolution is claimed.
