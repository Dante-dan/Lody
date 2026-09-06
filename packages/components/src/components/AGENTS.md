# Product surfaces (`src/components`)

Parent `AGENTS.md` files also apply. `CLAUDE.md` is a symlink; edit `AGENTS.md` only.
Child directories (`sessions/`, `mobile/`, `chat/`, `settings/`, …) own their own rules.

## [Sidebar and session rows](../../../../.agents/docs/components-sidebar-session-tree.md)

Files: `loro-sidebar.tsx`, `loro-app-sidebar.tsx`, `session-list.tsx`,
`sidebar-*.tsx`, `sessions/session-list-rows.ts`, `lib/session-opened-by-tree.ts`.

- Sidebar rows are sessions, not Tasks.
- EVERY desktop session row is a session-mention drag source
  (`lib/session-mention-drag.ts`). Session tabs match: parent tabs HTML5-drag,
  child tabs arm the in-flight store from dnd-kit. `startSessionMentionDrag` /
  `armSessionMentionDrag` light `ConversationDropOverlay` before `dragenter`.
  A navigation `<a>` overlay: `draggable` on the ROW, `draggable={false}` on the
  anchor.
- EVERY desktop row exposes Mark as unread from that shared ⋯ menu (Workspace,
  Local Project, Updated, Pinned). Hide it once the row is unread.
- `SessionMeta.openedBySessionId` indents via `lib/session-opened-by-tree.ts`.
  EVERY list uses it — `session-list.tsx`, local-project sections,
  `sidebar-updated-session-list.tsx` (Updated + Pinned) — plus
  `sidebar-navigation-model.ts`. Presentation only: not `parentSessionId`.
  Opened Sessions stay first-class; `parentSessionId` children never reach the
  sidebar (`sessionListAtom`).
- TWO fields, never merged: `openedBySessionId` is the PRECISE opener (navigation);
  `openedByRowSessionId` is the sidebar ROW. They differ when a child Tab creates
  a Session. `buildSidebarOpenerRowResolver` (`sessions/session-list-rows.ts`)
  walks `parentSessionId` to the root row. Never rewrite `openedBySessionId` to
  that root — "Go to Opener Session" / "Opened by" must land on the exact Tab.
- Opener and unrelated top-level rows keep flat-list alignment. The leading slot
  owns the node centre: opener disclosure at rest, ⋯ on hover; child ├/└ swap
  for ⋯ in the SAME 7px-centred position. Draw the tree UNCONDITIONALLY — a
  working / unread / waiting row must keep its nesting. Only a child widens the
  slot 14px → 26px (12px title indent) without shifting the row background.
  Connector geometry stays in `sidebar-row-shared.tsx`; the context-menu
  expand/collapse item uses the same toggle.
- Desktop status (working / waiting / unread) lives only in the END slot
  (`SessionRowStatusIndicator` inside `SidebarRowEndSlot`). While shown it
  REPLACES that slot's resting content so the right edge is one 14px mark.
  Pass the three flags to the end slot, never the leading slot. Mobile
  leading-node rules:
  [mobile/AGENTS.md](mobile/AGENTS.md).
- The resolver needs `allActiveSessions` from the sidebar, not from the rows.
- The tree never hides a Session: a missing, cross-section, cross-group,
  cycling, or deeper-than-one-level opener degrades to top-level. The preview
  cap counts top-level rows.
- Lists sort by latest activity: pass `rootRank`; rank an opener by its FRESHEST
  opened Session.
- Collapse state is `sidebarCollapsedOpenedBySessionsAtom`, default EXPANDED.
  Keep both directions: the tree and "Go to Opener Session" in every sidebar
  list, `SessionHeaderMenu.openedByRelations`, and the in-conversation cards.
  Mobile chat lists use the same two fields, per bucket, minus disclosure —
  [mobile/AGENTS.md](mobile/AGENTS.md).
- Lifecycle walks both relations: a root archive, restore, or delete includes
  child Tabs and independently opened descendants. Child Tabs share the root's
  machine command; independently opened Sessions enqueue their own. The archive
  list keeps opened-by indent; child Tabs stay in the owning Session's
  archived-tab UI.

## Entry points, drafts, and layout

- Chat landing: `chat/chat-landing.tsx`.
- Child-tab drafts use the same accept unit: `handleSendDraft`
  (`sessions/session-detail.tsx`) writes Session meta plus the first user turn
  via `startSession`, then promotes the draft tab. `requestSessionDispatch` is
  acceleration. Never create-then-hand-off. A promoted tab must not exist before
  its first message is locally durable. Composer text crosses promotion via the
  input draft cache, not a component ref. `archiveSession` falls back to the
  rendered meta cache; a close failure toasts — never a silent no-op.
- Desktop update prompt: `sidebar-update-banner.tsx` +
  `update-changelog-dialog.tsx`, selectors in `lib/electron-update-banner.ts`.
  Changelog opens in-app as sanitized Markdown (raw HTML off). The website is
  the no-notes fallback via `getChangelogUrl` / `openExternalUrl` only.
- `AgentActivityIndicator`, `ZoomableImageViewer`, and Electron image
  preview copy/save: [shared/AGENTS.md](shared/AGENTS.md).
  `ZoomableImageViewer` is the ONE image viewer.
- `web-workspace-layout.tsx` owns top and side safe-area insets
  (`getWebWorkspaceLayoutRootClassName`). iPad native is DESKTOP layout
  (`detectAppDeviceClass()` is `tablet`, viewport >= 768) with
  `viewport-fit=cover`. It stops at the sides; the bottom inset belongs to the
  surface (composer pads `env(safe-area-inset-bottom)`). Mobile insets per
  surface.

## Local projects

- Adding a folder is a workspace action: the picker chooses the machine. Copy
  is "Add folder", not "Add a local project". Settings > Projects pills EVERY
  addable machine and passes `initialMachineId`. Read
  `useAddLocalProjectMachines`; `canAddProjects` has one home. Onboarding is
  the exception: desktop native picker, this-machine only.
- Pending local-project removal is a visible lifecycle, not an absent project:
  keep the project and its Sessions discoverable while the machine is offline
  or retrying, but exclude it from new-Session selectors. After the catalog row
  is gone, archived Sessions stay readable and deletable; Restore stays off
  until the same local project is added again.
- Worktree cleanup is optional, default off, and only after the owning machine
  preflights every worktree. The original project directory is never deleted;
  list dirty worktrees and keep them by default. A completed cleanup is not
  pending removal — acknowledge it even when some worktrees were kept or failed.
