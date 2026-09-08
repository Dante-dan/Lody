# Desktop multi-window ownership and isolation

Status: implemented
Translation: current

English | [中文](2026-09-06-desktop-multi-window.zh.md)

## Abstract

Multiple desktop windows separate window-local navigation, replica caches, and
workspace-wide background work. Additional product renderers isolate layout and cache
state while retaining the same logical workspace and CLI execution service. Electron
main assigns one background owner per workspace and validates detach requests, so an
extra view does not also become an extra notification producer or execution service.
Isolation costs renderer memory and cache storage; Linux interaction checks passed,
but quantitative savings and macOS/Windows native behavior remain unverified.

## Decisions and trade-offs

- Explicit Session opens create new windows, including repeated opens of one Session.
  They do not move, clone, archive, or navigate the source Session. Navigation and right
  panels start closed with a one-shot composer focus intent; navigation can be expanded.
  Workspace-only targets open Chat Landing. Reusing an existing window would not give
  another independent view. Restoring all auxiliary windows after app restart is not promised.
- Modifier-click, row more/right-click menus, and the Session header menu share the
  new-window path. Only sidebar HTML5 drags opt into detach; accepted mention drops and
  tab-strip reordering keep their existing behavior. Main consumes a one-shot token,
  cancellation state, and native cursor/bounds evidence, rather than opening a window
  on every renderer `dragend`.
- Targets name a workspace and optional root Session/exact child tab, not arbitrary
  URLs. Explicit `?tab=session:…` prevents last-active restoration from replacing the
  requested conversation. Auxiliary windows reuse the guarded product-window factory;
  native menus, dialogs, and public browser views resolve their owning window.
- Desktop navigation collapse uses window `sessionStorage`; auxiliary draft/tab/panel
  state also uses it and does not overwrite primary last-route state. Sharing these
  UI keys across renderers would couple otherwise independent views.
- Auxiliary Repo, cursor, and eager-sync high-water caches use separate namespaces,
  not different logical workspace identities, transports, or CLI instances. This avoids
  multiple live replicas sharing one persistence identity, at the cost of duplicate
  cache data and potentially colder opens. It is not a claim that extra renderers are free.
- Main selects the first registered window per workspace as background owner, not the
  OS-focused window. Registration, workspace changes, and destruction recalculate ownership.
  Notifications, badges, and workspace watchers follow that assignment. Eager prefetch
  additionally requires effective navigation-sidebar visibility and document visibility;
  hiding navigation does not stop the active conversation or its agent. A hidden but
  registered primary window may remain owner.
- Optional organization activation resolves the invoking window's exact organization,
  rather than changing the account-wide active organization. It does not enable hosted
  operations in the public local composition or bypass membership checks. Sign-out and
  confirmed cache reset close other product windows to release stale authenticated views
  or open cache connections.

## Responsibilities and evidence

The [registry](../../../../apps/electron/src/main/app-windows.ts),
[target validation](../../../../apps/electron/src/main/app-window-target.ts), and
[drag lifetime](../../../../apps/electron/src/main/session-window-drag.ts) own native
identity, ownership, and detach acceptance. [Renderer bootstrap](../../../../apps/electron/src/renderer/src/main.tsx)
and [tab persistence](../../../../packages/components/src/lib/session-draft-tabs.ts)
separate initial focus/navigation from window-local UI state. The
[runtime provider](../../../../packages/components/src/providers/runtime-provider.tsx)
injects cache identity and activity; [background surfaces](../../../../packages/components/src/components/workspace-background.tsx)
gate owner-only consumers without replacing the active runtime.

Binding UI constraints remain in [source guidelines](../../../../packages/components/src/AGENTS.md).
Current explanations live in [tabs and routing](../../../docs/sessions-tabs-routing.md)
and [render cost](../../../docs/sessions-render-cost.md), not only in this dated record.

## Verification and limits

Committed coverage includes [target/drag tests](../../../../apps/electron/src/main/app-window-target.test.mjs),
[row/workspace gestures](../../../../packages/components/tests/sidebar-mark-unread-menu.test.tsx),
and [storage isolation](../../../../packages/components/tests/desktop-window-storage.test.ts).
Electron's 95-test suite passed. A Linux Electron check with an isolated synthetic agent
verified modifier/menu opens, unchanged source navigation, composer focus, independent
sidebar state, shared CLI, native mouse detach, and ownership transfer after primary close.
That ad hoc check is not a new committed cross-platform E2E scenario.

Build, type, and boundary checks passed during implementation. The full test run was
not green: 15 suites could not load because sidebar initialization accessed browser
storage without a browser, and one avatar-cache timing assertion failed. Initialization
was corrected to retain the browser-safe default outside Electron; all 16 affected
suites then passed on rerun (136 tests). The complete pipeline was not rerun afterward.

macOS/Windows native drag, fullscreen and multi-monitor behavior, optional hosted
multi-workspace integration, and measured memory/CPU savings remain unverified.
Existing capability gates still apply; this record does not approve a behavior Spec.

## Follow-up verification and upstream integration (2026-09-08)

The September 6 follow-up supersedes the earlier incomplete-run account above:
components passed 3191 tests and Electron passed 95; the existing real desktop E2E
suite passed 4 scenarios / 25 steps. Five CLI shim failures came from an external
temporary-directory ESM configuration; all 7 shim tests passed with an isolated
CommonJS temporary root. That focused rerun did not make the original aggregate
command successful.

The independent multi-window round passed 21 checkpoints, including first native
detach, bidirectional messages, and a held Agent remaining controllable after
primary-window closure. Consecutive native gestures still sometimes timed out
before DOM `dragstart`; isolated first-drag success does not clear that gap.

On September 8 the branch fast-forwarded to upstream `084ddb86`; local changes
were reapplied with both upstream local-file-resource tests and multi-window tests
retained. The upstream IPC typing rules and window-local storage rules both remain.
A new renderer drag now releases any unfinished prior token and preview before
arming itself. This fixes a superseded-drag resource lifetime, not a proven cause
of the native input timeout. [Deterministic lifecycle coverage](../../../../packages/components/tests/session-window-drag.test.ts)
checks cancellation reset, accepted drops, completion replay, zero-coordinate
cancellation, and replacement by a mention-only drag. The four focused test files
passed all 18 tests on this upstream base.

The rebuilt OSS desktop passed a fresh Linux acceptance round with all 23
checkpoints, including Escape → inside drop → outside detach, message convergence,
and Agent control after primary closure. This single successful sequence does not
establish the cause or elimination of the earlier intermittent native-input timeout.
The Electron suite passed 104 tests. Repository type checking and lint passed.
The broad `pnpm check` run was deliberately stopped during the slow component
suite; it is incomplete, not a full-suite pass. Boundary and documentation checks
are run separately. macOS/Windows and quantitative performance remain unverified.
No registered permanent E2E journey was added or promoted.

## Review corrections (2026-09-08)

Review found that sidebar visibility had accidentally become the lifetime of the
workspace Task Index: hiding navigation cleared task rows and open tabs, including
those consumed by the still-visible Tasks board/list and status watcher. Keep the
index mounted for every ready workspace with Tasks enabled, independent of sidebar
visibility and background ownership. Retaining this small shared projection costs a
subscription but preserves visible UI and watcher input; only sidebar-specific work
may be paused for sidebar visibility. Workspace loss and disabling Tasks still clean up.

Windows/Linux's Window → Close Window menu also retained the singleton primary-window
callback. It now closes the menu's target, falling back only to current native focus;
no focused window means no action. This is a whole-window action, distinct from
Ctrl+W's tab-first behavior, which is unchanged.

[Task-index lifetime coverage](../../../../packages/components/tests/main-layout-task-index.test.tsx)
uses the real layout and sync hook with a synthetic index wire and checks rows, open
tabs, hidden updates, Zen, readiness loss and the Tasks gate.
[Menu coverage](../../../../apps/electron/src/main/menu.test.mjs) executes the actual
template with native API doubles for Linux and Windows. Restoring the original code
made the task regression and all four menu cases fail; restoring the fixes passes.
These are targeted regressions, not a new native Windows/macOS acceptance run or a
complete repository test pass. The earlier native-drag uncertainty is unchanged.

## Relationship to earlier records

The scoped search found no earlier multi-window note to supersede. This adds a decision
record and updates existing Session explanations, including the former unqualified
claim that closing a lone parent always returns to Chat Landing. The
[communication architecture draft](../../../../specs/communication-architecture.zh.md)
remains a draft; cache namespaces do not change its logical workspace/CLI split.
No PR link is available for this change.
