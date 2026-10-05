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

## Pinned schema validation

Ran bundled Codex 0.159.2 `app-server generate-json-schema --experimental`
with an empty isolated CODEX_HOME, without login, microphone, or model requests.
The schema confirms required `threadId` and `outputModality`, v3, WebRTC SDP,
`prompt`, `includeStartupContext: false`, and `clientManagedHandoffs`. The start
response is empty; SDP answers arrive as separate notifications. This validates
shape only, not account access or event behavior. The voice thread must also
isolate its working directory, omit startup context, and deny any tool/coding
execution; a silent prompt or clientManagedHandoffs is not an enforced boundary
against the model starting execution.

## Same-version safety finding

The inspected official rust-v0.159.2 source routes `HandoffRequested` into
`route_realtime_text_input` regardless of `client_managed_handoffs`. That flag
only controls outbound forwarding. The start request has no tool-denial field;
read-only mode and refusing approvals do not prove that every tool is denied.
Do not wire the proposed capability into desktop capture until the native
boundary is established. The Core WIP types compile and pass the existing
suite, but no adapter advertises them and no microphone behavior was exercised.

[Pinned native handoff implementation](https://github.com/openai/codex/blob/ff6aec96948b70d94983af2641a6b67c94faeff5/codex-rs/core/src/realtime_conversation.rs)
