# `@lody/components` source guidelines

Parent `AGENTS.md` files also apply.

## Lightweight hosted entries

- Public/auth entry points that bypass the full product router import route-agnostic
  surfaces. Keep host navigation behind callback props so those surfaces do not import
  the route tree, `RuntimeProvider`, or workspace Flock document implementation. When
  an auth transition selects the destination, the host owns both the non-redirecting
  auth action and navigation so an auth helper cannot discard route-specific state.

## Keyboard navigation

- Each independently navigable list owns one `FocusScope` and one
  `useListKeyboardNavigation` call. Rows expose `data-scope-item` plus a stable
  `data-id`; Up/Down (and J/K) move only in the active scope, while the shell's
  single scope switcher uses Left/Right between visible leaf scopes. A local
  control may keep a key by calling `preventDefault`; text inputs are never
  intercepted. Nested parent scopes yield to their visible child scopes, and an
  open dialog's scopes never switch focus into the background workspace.

## Zen layout

- `zenLayoutModeAtom` is a transient visibility override, never a persisted sidebar
  preference. Entering or leaving Zen must not write `sidebarCollapsedAtom` or a
  Session's persisted right-panel `open` state, so the exact pre-Zen layout restores.
- An explicit request to show either sidebar exits Zen and reveals that sidebar. Use
  the shared layout-state actions for the navigation sidebar; every Session action
  that opens a viewer, Files, Changes, PR, Browser, or Side Chat must clear Zen.
- Drive hidden-panel work from effective visibility (`open && !zen`), not the stored
  open bit. A Zen-hidden PR, Browser, viewer, or Side Chat must pause exactly like an
  ordinarily collapsed right panel.

## Workspace transitions

- Authenticated workspace switches keep `MainLayout` mounted: the sidebar and
  workspace identity are stable chrome, while the content pane shows a scoped
  placeholder until route, runtime, and doc-meta ownership agree. Pending scope
  still fails closed — never retain the previous workspace's rows or `<Outlet />`
  content — and passes `workspaceReady={false}` so workspace-owned background work
  and the mobile workspace stack do not start early. The workspace identity's
  syncing state follows that same scoped readiness, not the coarser connection
  state; an online transport does not imply that workspace data is ready.

## Desktop windows

- Workspace, Local Project, Updated and Pinned Session rows share
  `SessionWindowMenuItem` and the modifier-click action; new-window navigation must
  leave the source route intact. Only sidebar HTML5 drags opt into detach; accepted
  mention drops and tab-strip reordering retain their existing behavior.
- A dedicated Session window must enter the exact conversation with side panels
  closed and one-shot composer focus. Cmd/Ctrl+W on its lone parent closes that
  window; the primary window retains its existing Chat Landing behavior.
- Background ownership, not OS focus, gates notifications and badge subscriptions;
  destroying an owner hands work to a remaining window in that workspace. The
  command palette subscribes only while open.
- Task Index sync is workspace-scoped, not sidebar-scoped: keep it mounted while
  Tasks is enabled and the workspace is ready, even with collapsed navigation or Zen.

Ownership and isolation rationale:
[multi-window decision](../../../.agents/notes/implemented/architecture/2026-09-06-desktop-multi-window.md).
Current interactions: [routing](../../../.agents/docs/sessions-tabs-routing.md) and
[background work](../../../.agents/docs/sessions-render-cost.md).

## Billing data

- When authenticated user and workspace resolution completes, preload the billing
  overview into the existing session-scoped billing-page cache. The preload is only
  a latency optimization: billing permissions, quota checks, destructive-operation
  guards, and Stripe invoice history keep their existing live/on-demand data paths.

## ACP selectors

- Built-in Codex reasoning selectors normalize cached options against exact model support
  in `components/shared/acp-selector-options.ts`: Astra, Sol, and Terra expose Max/Ultra;
  Luna exposes Max only. Keep this aligned with the ACP model catalog; a model version
  threshold cannot represent per-model differences, and cached efforts may belong to
  a different selected model.

## ACP authentication

- Custom and Registry Provider authentication renders supported agent-driven method choices and
  request-scoped URL plus text/secret/single-select form interactions. Form replies use the
  encrypted authentication-input path; deprecated `env_var` and non-interactive terminal methods
  do not become Provider-config credential forms. Authorization pages are HTTP(S) only. Bind every
  progress event and reply to the exact machine/config/launch/env snapshot that started the request;
  changing that target cancels the old request, and a late reply must not clear or report an error
  over a newer interaction. Clear manual codes and form values on completion, cancellation, target
  change, and failure; never seed a secret field from retained progress.
