# Bound Codex realtime voice to editable dictation

Status: proposed
Translation: current

[中文](2026-10-06-codex-realtime-dictation.zh.md)

## Abstract

Lody has no voice input, and #1263 reports that its bundled Codex runtime can
use subscription-authenticated WebRTC. The proposed first slice produces an
editable composer draft and requires ordinary Send; spoken conversation remains
separate. A dedicated short-lived Codex voice process preserves the destination
coding session and avoids transporting microphone audio through the daemon.
Native experimental compatibility, capture cleanup, and concurrent editing
remain unverified; notification types alone do not establish usable support.

## Decision and boundaries

The [draft Spec](../../../../specs/codex-realtime-dictation.md) owns intended
behavior. This is a new feature, not a reproduced bug. The issue author's local
experiment is evidence of demand and feasibility, not our executed validation.
No existing active voice/realtime PR was found in the targeted current search.

Use a selected existing Codex configuration for voice and the ordinary composer
for message dispatch. Native negotiation belongs in the Codex adapter; shared
extension DTOs/capability belong in ACP Core, never duplicated in Lody. Renderer
capture and daemon signaling must use existing authenticated local boundaries.
Do not add hosted endpoints or alter the selected coding agent.

Text-only v2 and websocket transcription do not satisfy the subscription WebRTC
request. The issue says v3 requires keeping model audio output and reading
`input_transcript.added` from `oai-events`; muting output is not a promise that no
realtime model response occurs. OS dictation avoids integration work but does
not use the requested existing Codex login. A separate transcription API adds
a key and billing requirement the request explicitly avoids.

## Implementation order and verification limits

1. Verify native experimental request/event schema against the pinned runtime;
   define Core capability and start/stop signaling contracts.
2. Implement adapter-owned short-lived voice threads and daemon cleanup without
   sending audio through the daemon or exposing profile credentials.
3. Implement opt-in desktop capture, consent disclosure, ready-state indication,
   event identity, draft insertion, and cancellation; add macOS permissions.
4. Extend owning behavioral tests and exercise real Codex and isolated desktop
   capture under repository QA instructions. Measure the connection gap rather
   than representing the author's three-second observation as our result.

The inspected adapter exposes native JSON-RPC and generated realtime
notifications but no realtime start method. Its generated stable request
surface is insufficient for this experimental method. There are no runtime
changes in this design slice. No native or microphone test was run. This note
requires no claimed human approval and does not satisfy implementation acceptance.

## Sources

- [Issue #1263](https://github.com/LodyAI/Lody/issues/1263)
- [Codex app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- `packages/acp-extension-codex/src/CodexAppServerClient.ts`
- `packages/acp-extension-codex/src/CodexJsonRpcConnection.ts`
- `packages/acp-extension-core/src/methods.ts`
