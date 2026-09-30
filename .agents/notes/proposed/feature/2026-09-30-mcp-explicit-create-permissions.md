# Explicit ACP selection for MCP creates

Status: proposed
Translation: current

[中文](2026-09-30-mcp-explicit-create-permissions.zh.md)

## Abstract

Non-Role MCP creates omit the permission selectors already supported by CLI creation (#1172). The proposed API accepts explicit `modeId`, publishes the target's advertised choices, and delegates validation to the existing create boundary. Operation identity and accepted execution configuration retain the selection; Role-owned configuration remains authoritative. The changed MCP intent is recorded as draft in [Session orchestration](../../../../specs/session-orchestration.md), pending human review rather than a claimed security-policy approval.

## Decision and limits

Use concrete ACP selectors instead of inventing a universal permission vocabulary: agents advertise different modes, and Grok must not receive an unadvertised builtin default (#606/#607). Requests are validated before Operation acceptance by `validateSessionCreateOptions`, which reads target capability, rejects invalid modes, and preserves existing machine authorization. Semantic model/effort/fast/plan mapping remains unchanged; its resolved selectors retain their existing precedence. Manual concrete fields are stripped for Role creates by the same override-field projection.

Single/batch schemas share the selectors. Canonical command fingerprints include the explicit mode, and existing accepted target dispatch configuration freezes them for recovery. Discovery publishes mode ids/names, without credentials or launch configuration. Arbitrary ACP option dictionaries remain outside this change. No provider default, machine access, Role authority or permission consent policy is changed. The issue's broader policy discussion stays for maintainer review of this draft; no expanded privilege decision is attributed to a human.

## Verification

The MCP, discovery and session command suites passed (135 tests); the updated MCP suite passed again (38 tests). CLI typecheck, root formatting and documentation checks passed. Root `pnpm check` initially stopped at the Devin adapter build because its dependencies were missing; the frozen install populated dependencies but its Electron postinstall could not write its host cache. The root check retry is recorded separately at delivery. Live provider permission dialogs and desktop behavior are not reproduced. No upstream approval is claimed.
