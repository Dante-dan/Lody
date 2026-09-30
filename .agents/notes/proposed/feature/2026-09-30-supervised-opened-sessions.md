# Supervise agent-opened Sessions without sharing their workspaces

Status: proposed
Translation: current

[中文](2026-09-30-supervised-opened-sessions.zh.md)

## Abstract

MCP-created Sessions currently keep independent workspace documents but also appear
as independent conversations demanding attention. This proposal keeps isolated
execution and moves the worker's status, result, unread, and permission attention
to its opener, reserving a peer conversation for explicit handoff. It requires a
durable supervision choice and cross-client routing work, so this change only
prepares the bilingual [draft Spec](../../../../specs/supervised-opened-sessions.md)
for human review; it does not change runtime behavior.

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
Sessions with independent documents. No implementation tests, live desktop or
mobile checks, maintainer approval, or human Spec approval are claimed here.
