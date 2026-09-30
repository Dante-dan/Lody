# Session chat sender provenance

Status: proposed
Translation: current

[中文](2026-09-30-session-chat-provenance.zh.md)

## Abstract

Session chat previously appeared as ordinary user text, which obscured who wrote
it. The proposed fix records server-derived sender provenance and wraps the
message in a generated, JSON-quoted non-human notice. It covers initial MCP chat,
chat-many and durable retry without changing authorization identity. Native
provider role metadata is not included in this fallback.

## Decision and limits

Refs LodyAI/Lody#1173. The sender comes from the active invocation or frozen
Operation, not a message header. Both the target history and dispatched prompt
carry the generated notice; the input configuration retains a bounded origin.
JSON quoting keeps forged headers inside the message rather than permitting
additional outer provenance lines. Ordinary CLI human chat has no origin and is
unchanged. This is provenance evidence, not an authorization boundary or a
prompt-injection guarantee.

The existing Session orchestration Spec remains draft. Relevant helper, parser
and real HistoryWriter snapshot tests are required. Full checks and provider/UI
runtime validation must be reported from actual execution, not assumed.
