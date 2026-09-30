# Session orchestration chain depth

Status: draft
Translation: current

[中文](session-orchestration.zh.md)

When an Agent delegates asynchronous work through Lody, each delegated target
continues the causal chain from the driving human turn. Lody accepts at most 32
such hops. A command issued by a turn already at depth 32 is rejected before an
Operation or target Session is created, with the non-retryable
`CHAIN_DEPTH_EXCEEDED` error.

The depth is a causal delegation count, not a general `parentSessionId` tree
depth. Creating a Session, sending work to another Session, and delivering an
Operation continuation each advance the target turn by one. A missing depth on
an ordinary human turn starts at zero. The limit remains fixed in the shared
protocol contract; changing it requires updating every producer, recovery path,
executable model, and this Spec.

Machine-side review automation runs outside this MCP delegation chain. It keeps
its own round, token, and authority budgets while reacting to external review and
CI state.

## Local and cloud execution

An OSS Agent Role mention must create work without a Lody account or authenticated
product-cloud requests. Session/catalog MCP calls enter the daemon holding the
local workspace. It derives identity from the active Turn, checks the exact local
machine and project, and executes the same Role resolution and durable Operation
state machine used by cloud. Hosted repository contexts remain unavailable;
registered local projects and plain chat are supported.

Recovery uses the frozen prompt, Role revision and dispatch configuration. Before
replaying a missing target input, cloud confirms remote document catch-up; OSS
confirms the authoritative daemon repo and rechecks the fixed Turn under the
existing materialization claim. Missing cloud connectivity never counts as local
authority in a cloud workspace. Completion uses the existing single-owner Delivery
protocol. No persisted schema or hosted API changes are required.

## Cross-session message provenance

A Session-sent chat is agent-authored input, even when both Sessions belong to the
same person. Its target turn records `sessionChatOrigin` from the invoking Session
and frozen source Turn, never from sender-controlled message text. Durable retry
uses the Operation's requester Session and source Turn. This does not change the
human identity used to authorize the request.

The receiver and history reader see a Lody-generated non-human notice, sender
provenance and a JSON-quoted message. Embedded newlines and forged notices remain
inside that quoted message. Ordinary human chat stays unchanged. This text fallback
does not promise that a provider harness gives the turn a non-human native role;
adapter-specific out-of-band metadata remains a separate extension.

## Implementation evidence

The implementation guard is `apps/cli/src/mcp/lody-mcp-server.ts`, the shared
limit is `packages/shared/src/session-orchestration.ts`, and the executable
Operation model is `apps/cli/src/orchestration/operation-model.ts`.

This draft records the requested limit of 32. Runtime and deployed-client
acceptance remain to be verified after dependencies are installed.
