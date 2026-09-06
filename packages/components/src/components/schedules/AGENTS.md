# Schedule UI

`CLAUDE.md` is a symlink to this file.

- One workspace-shell Registry subscription supplies list and provenance links;
  details acquire/release one Schedule store through WorkspaceRuntime. All writes use
  `withScheduleStore`, retaining an active uploader ref until synchronization. Never load
  every definition for listing. The developer + beta gate hides navigation,
  commands and background subscriptions together on every platform.
- `schedule-view.tsx` is presentational and has Storybook fixtures;
  `schedules-workspace.tsx` owns domain writes, selectors and route composition.
  `schedule-save-blockers.ts` is the one save rule, `schedule-format.ts` the one
  vocabulary, `schedule-property-row.tsx` the one layout primitive (label left,
  live value right, rows appearing only when they apply).
  Agent/Project selectors live in `components/shared`; Task wrappers own Task
  visual tokens. Keep Schedule independent of delegated Task state.
- Save requires an Agent with an explicit permission mode on an owned, capable
  machine. It does NOT require a project: a schedule with none runs as a plain
  chat, end to end (optional `project` in the definition, registry row, draft and
  CLI target). Every save blocker must have a visible, actionable reason above
  Save; `collectScheduleSaveBlockers` drives the button, the explanation and the
  submission guard so the three cannot disagree.
- There is deliberately NO repeated confirmation on this path: no automation
  consent checkbox, no directory-scope checkbox (the worktree switch IS that
  choice, with an inline note when it is off), and no full-access warning or
  resume dialog. Permission mode stays visible and explicitly chosen. Do not
  reintroduce any of them in another shape — removing duplicate confirmation is
  not a relaxation of ownership, capability or permission validation, which all
  still gate save, resume and run.
  Run now confirms saved configuration and may overlap existing work. Pause does
  not cancel an already submitted Session.
- Frequency is edited as a named recurrence, never as raw cron. The persisted
  trigger union is unchanged; `@lody/shared`'s `schedule-recurrence.ts` maps both
  ways. A rule it cannot name opens as `custom` with the expression verbatim, and
  an untouched rule is re-emitted byte for byte so saving cannot silently rewrite
  an existing plan or invalidate its fingerprint.
- Owner-only reduction of authority (pause/delete) remains possible when the
  machine is gone or outdated. Creating/editing/resuming/running requires the
  target Machine protocol capability. Never fall back to a different Agent.
- History consists of ordinary Sessions with sparse `SessionMeta.scheduleId`;
  the Session info bar links back. Provider-native cron history is independent.
- Use shared time calculation for future slots. Wall-clock rules preview in their
  authored IANA zone; once/interval inputs use the explicitly labelled device
  zone. Runtime projections must match Machine, activation and definition
  fingerprint.
- The list is one column template shared by its header and every row. The actions
  column is a fixed width, never `auto`: content-sized it redistributed the `fr`
  columns per row and left Frequency and Next run visibly unaligned.
