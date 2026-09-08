# Session render-cost and subscription invariants

Subscription scope, session-switch reset, restored side-panel state, and branch labelling.

Scope: `packages/components/src/components/sessions`. Binding rules and the
pointer to this page live in
[that directory's AGENTS.md](../../packages/components/src/components/sessions/AGENTS.md);
this page is the full text of the rules summarised there.

- `session-detail.tsx` must not subscribe page-level `activeSession` to Code Collab
  file-index Flock state. That state can update from file watchers and should only
  invalidate file surfaces, not the whole chat/message list.
- Message rows must not subscribe to full `sessionMetaAtomFamily`. Select only
  the fields needed by row UI (for example avatar `cliType`/`agentType`/`env`) so
  Code Collab shared-state metadata does not wake idle markdown rows.
- Treat Code Collab file-index Flock state as large/path-keyed state. Keep it out
  of repo meta and subscribe from file provider hooks only.
- `session-detail.tsx` owns session-switch local UI reset. Keep the reset in the
  render-phase `localStateSessionId !== sessionId` branch; do not add a second
  `useEffect([sessionId])` reset that replays the same state updates.
- **A RESTORED side-panel state must not animate.** The desktop panel animates
  `flex-grow`/`min-width`, so one 220ms expand runs style → layout → paint →
  compositing for the whole detail tree every frame — measured at ~400ms of
  near-saturated main thread per session switch. Any code path that sets
  `isSidebarOpen` from persisted/URL state rather than from a user action must
  bump `sidebarRestoreSeq` in the same commit (today: the session-switch reset
  branch and the `?pr=` deep-link RENDER-PHASE adjustment — the restore is
  deliberately not an effect, so the `?pr` clear effect can never observe
  pre-restore sidebar state); `DesktopSessionDetailLayout` then
  applies it in one frame and re-arms the transition on the next rAF. User
  toggles (`handleToggleSidebar`, `handleOpenPrTab`, viewer/browser opens) still
  animate and must NOT bump it.
- Branch UI shortcut: "current branch" copy uses `SessionMeta.branchName` only.
  `SessionMeta.baseBranch` / `project.branch` are start/base refs; they may be
  shown as base fallback, but must not be copied or labeled as current. The
  mobile bottom `SessionInfoBar` omits branch information; desktop keeps it.

## Multiple renderers and navigation visibility

Electron main's `app-windows.ts` assigns one background owner per workspace in
registration order and publishes context changes on registration, workspace
change, and destruction. `MainLayout` uses that assignment for completion
notifications, badges, task status and auto-archive watchers, subject to their
existing capability gates. Ownership is not OS focus: a hidden but registered
primary window can remain owner. Closing it only transfers ownership if it is
destroyed, rather than hidden by the platform's primary-window close policy.

`RuntimeProvider` gives auxiliary renderers separate Repo, cursor and eager-sync
high-water cache namespaces, without changing workspace identity, transport
topology or CLI ownership. Each renderer still owns its active conversation runtime.
For desktop eager prefetch, the activity port requires background ownership AND
effective navigation-sidebar visibility; the coordinator also checks document
visibility. Activity changes pause/resume prefetch without rebuilding the runtime.

Main-layout task-index sync remains mounted while Tasks is enabled and the workspace
is ready, including collapsed navigation, Zen and auxiliary windows. The same index
feeds the Tasks list/board, open task tabs and status watcher; unmounting it clears
those shared projections and is not a sidebar-only optimization. Workspace changes
and disabling Tasks still release the index. The command palette mounts subscriptions
only while open. Current conversation updates and execution remain live. The right
panel's mounted-but-hidden contract is separate from left navigation visibility;
its consumers still need their own visibility gates.

See the [source constraints](../../packages/components/src/AGENTS.md#desktop-windows)
and [decision record](../notes/implemented/architecture/2026-09-06-desktop-multi-window.md).
Reduced subscription/prefetch scope is established by the implementation, not a
measured memory or CPU savings figure.
