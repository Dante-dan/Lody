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
no linked human approval; the implementation remains a draft for review.

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

Before production integration, reviewers need to decide the persisted supervision and
handoff field, permission routing when the opener is gone or unavailable, and the
scope of notification roll-up across local, cloud, desktop, and mobile clients.
Acceptance should cover isolated concurrent work contexts, opener Tabs, reconnect,
permission waits, completed and failed Operations, settle without deletion,
explicit handoff, and existing Session compatibility. The bounded reference projection in
[`supervised-opened-session.ts`](../packages/shared/src/supervised-opened-session.ts)
accepts an explicit relationship and observed state without changing persisted
Session metadata. It routes Tab-opened workers to the root only when that route
is addressable; otherwise the worker keeps its inbox. Permission waits override
completion and settlement, and running or unknown work cannot be settled. Its
behavioral suite exercises these decisions; production supervision creation, permission
transport, notification roll-up, and the worker roster remain unimplemented.
The existing creation-progress card now independently carries a bounded result
preview from the creating Operation. A completion can suppress its duplicate
card only when progress preserves that preview; this slice does not hide workers
or change their permission ownership.

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

## Durable creation intent slice

Independent MCP creations accept `openedSessionMode: supervised | handoff`, defaulting
to `supervised`. Single/batch Commands freeze it; recovery preserves it in metadata
with exact opener/root pointers. Child Tabs omit it. Ordinary CLI creates and old
Operations without intent stay legacy peers; provenance never implies supervision.

The choice does not suppress worker inboxes, reroute notifications, or move consent
ownership. Those consumers need a verified parent route with worker fallback.
Operation result previews remain the production parent result surface. There is
no live desktop/mobile observation or human Spec approval.

Supervised progress cards now also expose the worker's durable permission-wait
summary at the opener. A person can open the worker to answer its original request;
clearing the wait clears the badge, and a stale Operation completion never clears
consent. Legacy, handoff and child-Tab cards keep their previous behavior. This
attention surface does not reroute cloud notifications or suppress worker rows.
