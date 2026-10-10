# Runtime-owned optional capabilities

Status: draft
Translation: current

[中文](runtime-capability-installation.zh.md)

A person configuring a saved local Kimi provider can browse Computer Use and WebBridge, inspect installation and prerequisite status, and explicitly confirm installation in Lody. The runtime owns detection, downloads, installation and its data directory. Lody forwards requests; it never writes into `KIMI_CODE_HOME` or treats installation as permission to control the computer or browser.

The versioned ACP `runtimeCapabilities` advertisement is the authority for support. Without it, clients report unsupported and do not send installation requests. An installation requires explicit confirmation for that capability. Native readiness, installation errors and missing prerequisites remain visible separately; downloaded software does not imply granted OS permissions or a connected browser extension.

The reference implementation targets local desktop provider settings. Remote transport, newly unsaved provider configurations and streaming progress remain outside this slice. The consequential decision for human review is whether runtime-owned installation with a separate user consent boundary is the desired product/security contract. This draft has no human approval.

## Evidence

Issue [#798](https://github.com/LodyAI/Lody/issues/798); shared contracts in `packages/acp-extension-core/src/runtime-capabilities.ts`; runtime facade `packages/acp-extension-kimi/packages/klient/src/core/facade/global.ts`; client `apps/cli/src/agent/runtime-capabilities.ts`; settings `packages/components/src/components/settings/runtime-capabilities-field.tsx`. Source validation does not establish a published managed runtime artifact.
