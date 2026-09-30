# Supervise agent-opened Sessions without sharing their workspaces

Status: proposed
Translation: current

[中文](2026-09-30-supervised-opened-sessions.zh.md)

## Abstract

MCP-created Sessions currently keep independent workspace documents but also appear
as independent conversations demanding attention. This proposal keeps isolated
execution and moves the worker's status, result, unread, and permission attention
to its opener, reserving a peer conversation for explicit handoff. It requires a
durable supervision choice and cross-client routing work, so this change prepares a bounded
reference projection and the bilingual [draft Spec](../../../../specs/supervised-opened-sessions.md)
for human review. The existing creation-progress card now retains the worker
result preview; production supervision and permission ownership remain unchanged.

## Decision and evidence

[#529](https://github.com/LodyAI/Lody/issues/529) describes the user cost: each
opened worker is a sidebar chat with its own unread and notifications, while the
parent sees a creation card rather than the result. Source inspection confirms
the separation between an independent `workContext` Session and a contained Tab:
`lody-mcp-server.ts` defaults same-machine local Roles without `workContext` to
`useCurrentSessionAsParent`; `session.ts` rejects a project/worktree on that Tab
path. The current completion notification passes the worker Session id. These
facts support the need for attention routing without collapsing storage identity.

The proposed product contract is in the draft Spec. Its first implementation
slice should make results and permission waits visible at the opener before worker
rows move to a panel. The exact persisted supervision field, fallback when the
opener disappears, and cross-client notification ownership need human intent
review. `openedBySessionId` alone is historical provenance and cannot serve as
a handoff flag without changing the meaning of existing data.

## Alternatives and limits

Making every worker a child Tab avoids a sidebar peer but shares the root
workspace, so concurrent file work loses isolation. Keeping the current separate
sidebar row and muting its notification only hides permission waits. Treating all
opened Sessions as supervised would also misclassify intentional handoffs and old
records. This draft separates the choice explicitly and leaves old presentation
unchanged pending a migration decision.

The existing [Session relations Spec](../../../../specs/session-relations.md)
still owns archive, restore, and deletion target sets. The
[subagent events Spec](../../../../specs/subagent-events.md) concerns native
provider runs inside one Lody Session; it is not a substitute for MCP-created
Sessions with independent documents. The reference projection is deliberately not exported from the shared package
entry point or connected to production consumers. Its explicit relationship
input preserves legacy and handoff behavior; unavailable or unknown opener
routes keep the worker inbox visible. Settlement only hides finished supervised
work with no permission wait and never changes document lifecycle.

The owning behavioral suite covers root routing from a Tab, result previews,
permission fallback, pending consent after completion, settlement and resumed
work, unknown observations, legacy peers, and malformed self-opening relations.
It does not verify durable schema migration, permission transport, live desktop
or mobile behavior. No maintainer or human Spec approval is claimed.

## Result preview implementation slice

Creation progress previously recorded only a terminal status. Completion cards
are suppressed when that progress row exists, so a successful worker result
was absent from the initiating conversation. The shared history planner now
projects Operation output into an optional, whitespace-collapsed preview capped
at 240 characters plus an ellipsis. Terminal rows can acquire this output without
regressing status. The coordinator retains completion fallback when published
progress lacks the expected preview, and the renderer passes it to the existing
creation card's detail field. Full output remains in the Operation/worker, not
in another transcript copy.

This slice extends the existing real-Loro snapshot/reload suite and coordinator
fallback suite. It is independent of the proposed supervision relationship and
does not change archive, permission, notification, or inbox ownership.

## Durable creation and permission attention

MCP independent creates now freeze `openedSessionMode` (`supervised` by default,
explicit `handoff`) in Operation identity/recovery and Session metadata. Child Tabs,
ordinary CLI creates and legacy Commands omit it. Pre-upgrade retries retain their
original Command; changed intent or human identity still fails the store fence.
The real LoroRepo and MCP suites cover these boundaries.

Supervised parent cards now expose durable permission waits without changing exact
Operation status. Clicking opens the worker to answer its original request; clearing
the wait removes the badge. Handoff/legacy/child cards stay unchanged. Cloud
notification roll-up, inbox suppression, roster and settlement remain unfinished.

Routine completion notifications now target a known active opener root when its
owner is the notification recipient; missing, archived, foreign-user or child-root
metadata falls back to the worker. Exact permission request identities remain on
the worker. The existing related-Sessions tree preserves its count/navigation and
shows durable supervised consent waits even without live machine presence.
Dedicated roster settlement, unread roll-up and permission-push grouping remain open.
