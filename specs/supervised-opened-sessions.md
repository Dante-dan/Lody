# Supervised opened Sessions

Status: draft
Translation: current

[中文](supervised-opened-sessions.zh.md)

An agent may open a separate Session to work in its own local project directory. The
person remains in the initiating conversation to supervise that work. The opened
Session needs a separate document and execution context, while its progress, result,
unread attention, and permission requests should return to the initiating Session.
An explicit handoff instead makes the new Session a peer conversation that the person
will own and visit directly. This draft proposes the distinction for [#529]; it has
no linked human approval and does not authorize a runtime behavior change yet.

## Relationship and presentation

`openedBySessionId` records the precise opener, including when that opener is a
Tab. `openedByRootSessionId` supplies the routable root. Neither field alone says
whether the new Session is supervised work or a handoff. Creation must persist that
choice so reconnect, another device, and historical rendering do not infer it from
machine liveness, sidebar state, or whether a worktree exists. Existing Sessions
without the choice retain their current presentation until a migration is designed.

A supervised worker remains an independent Session document with its own
`workContext` and runtime. The initiating Session presents an opened-worker roster
with count, status, and a short result; a person can drill into the full worker
conversation. Routine completion and unread attention appear on the initiating
Session instead of adding a first-class inbox item for every worker. Permission
requests still reach the person through that initiating Session and identify the
worker and exact request. A failed route must not silently grant or discard consent.

The worker's Operation output supplies the parent result preview. A generic
"Session created" card is insufficient once the worker has produced a result.
The roster distinguishes running, waiting for permission, completed, failed, and
observation-unknown states when evidence supports them. It does not equate a
temporarily disconnected machine with completion or with the person viewing the
parent. Settling a finished worker removes it from the active roster without
deleting its document. Dismiss-all affects eligible finished workers, not active
work or pending permission requests.

An explicit handoff creates a peer Session with its own inbox, unread, and
notification behavior. Phone-only conversations initiated by a person also remain
first-class. A handoff cannot be inferred from an agent selecting a different
machine or project. The exact user-facing control and protocol field for handoff
remain open for review.

## Rollout and compatibility

If the behavior is split, route attention and permission waits before hiding
worker rows in a panel. A panel alone would hide work the person must answer.
Keep independent `workContext` creation available; defaulting to
`useCurrentSessionAsParent` would turn the work into a child Tab that shares the
parent workspace. The existing [Session relation contract](session-relations.md)
continues to govern archive, restore, and deletion; settle is only presentation
state and must not change those target sets. Native provider subagent events in
[their separate Spec](subagent-events.md) remain distinct from Lody Sessions
created through MCP.

Before implementation, reviewers need to decide the persisted supervision and
handoff field, permission routing when the opener is gone or unavailable, and the
scope of notification roll-up across local, cloud, desktop, and mobile clients.
Acceptance should cover isolated concurrent work contexts, opener Tabs, reconnect,
permission waits, completed and failed Operations, settle without deletion,
explicit handoff, and existing Session compatibility. No such runtime tests are
claimed by this document-only proposal.

## Evidence and limits

The scenario and requested behavior come from [#529](https://github.com/LodyAI/Lody/issues/529).
The inspected MCP creation path is
[`lody-mcp-server.ts`](../apps/cli/src/mcp/lody-mcp-server.ts); its local Agent Role
default currently chooses `useCurrentSessionAsParent` when no `workContext` is
given. [`session.ts`](../apps/cli/src/commands/session.ts) rejects combining that
parent relation with a separate project/worktree. The current completion request in
[`notification-service.ts`](../apps/cli/src/lib/notifications/notification-service.ts)
targets the worker Session id. The created-Session card lives in
[`created-session-operation-card.tsx`](../packages/components/src/components/ai-gui/created-session-operation-card.tsx).
These are source observations at the proposal revision, not proof of deployed behavior.
