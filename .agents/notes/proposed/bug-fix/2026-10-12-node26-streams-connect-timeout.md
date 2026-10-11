# Investigating Node 26 Streams connection timeouts

Status: proposed
Translation: current
Issue: https://github.com/LodyAI/Lody/issues/1420

[中文](2026-10-12-node26-streams-connect-timeout.zh.md)

## Abstract

Issue #1420 reports that CLI 0.104.0 reconnects presence every ten seconds and cannot synchronize metadata on Node 26.4.0, while Node 22 works on the same machine. The ten-second deadline in the pinned Streams SDK bounds initial HTTP connection/response headers; it is cleared after fetch resolves and does not bound a healthy SSE body's lifetime. Current source does not establish a Node-version-specific defect. Changing the runtime support range or extending the deadline requires additional evidence from the affected authenticated connection.

## Source findings

The inspected Lody revision is `987962e77022df6a800f4e889f124b51f6eb8056`, whose CLI manifest is 0.104.0. It pins `@loro-dev/streams-crdt` 0.16.2, `@loro-dev/streams-client` 0.9.0 and `loro-repo` 0.22.0.

- [CLI transport](../../../../apps/cli/src/utils/http-transport.ts) installs a proxy-aware Undici global dispatcher at startup. The default is HTTP/1, with address-family autoselection enabled; HTTP/2 is opt-in.
- [Presence](../../../../apps/cli/src/lib/loro/presence.ts) uses the SDK's default fetch. The SDK's `readEphemeralSse` calls `fetchAuthorized` with `connectTimeoutMs`; `fetchWithTimeout` clears its abort timer in `finally` after response headers resolve. The SDK default is 10,000 ms.
- [Durable metadata/documents](../../../../apps/cli/src/lib/loro/streams-transport.ts) use `StreamsTransportAdapter`. Its pinned public options do not expose custom fetch injection. Routing only presence through bundled Undici fetch would leave the reported metadata failure unexplained.
- The SDK permits a separate fetch implementation for presence. The Node-version correlation does not establish whether the failure is in native fetch, the installed dispatcher, DNS/TLS, or an authenticated server interaction. A reachable unauthenticated endpoint and a different public SSE endpoint do not exercise that same protocol.

## Decision and limits

Keep runtime support and connection deadlines unchanged until a failing boundary is identified. The existing `LODY_HTTP_TRANSPORT=node` escape hatch, in a freshly restarted daemon, can distinguish the custom global dispatcher path from Node's default dispatcher. `LODY_HTTP_TRANSPORT_DIAGNOSTICS=1` provides connection/ALPN diagnostics without requiring credentials to be published. Any shared diagnostics must omit tokens, stream/workspace identifiers and private session content.

The local OSS composition has no authenticated hosted Streams bridge. Existing repository tests can check transport and presence behavior, but cannot substitute for the affected authenticated request timeline or prove the reported macOS 27/Node 26.4 scenario fixed.

## Verification

At the inspected revision, existing CLI `http-transport.test.ts` and `presence.test.ts` pass on both Node 22.16.0 and official Node 26.4.0 Darwin ARM64: two files, twenty tests on each. The Node 26 archive SHA256 matched the [official release](https://nodejs.org/en/blog/release/v26.4.0). This is baseline evidence only; no product fix or affected-machine reproduction is claimed.

Document status/check and formatting completed. The full `pnpm check` was started but interrupted while its ACP Claude TypeScript build remained in progress; it is not recorded as passing. This branch contains investigation notes only and no product change.
