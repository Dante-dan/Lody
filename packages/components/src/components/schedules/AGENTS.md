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
- Frequency is always edited through pickers, never by typing cron. The persisted
  trigger union is unchanged; `schedule-recurrence.ts` maps the named rules
  (daily/weekdays/weekly/monthly/interval/once) both ways, and `Custom` is edited
  field by field through `schedule-cron-fields.ts` + `CronFieldRow`. A whole-
  expression text box exists but is opt-in and never the default.
- Two things keep that from narrowing what a person can express: every field
  offers every mode (a trimmed menu would blank a stored mode it does not list),
  and a field whose spelling the pickers cannot reproduce stays `raw`, verbatim,
  in its own text box. So `parse`/`format` round-trip byte for byte, and an
  untouched rule is re-emitted unchanged — saving can never silently rewrite an
  existing plan or invalidate its fingerprint.
- **The five fields are the edit state.** `ScheduleRecurrence['custom']` carries
  `fields` (plus a `draftText` while the whole expression is being typed), and
  nothing re-derives an edit mode by serializing and re-parsing. Deriving it is
  what made a `raw` field snap back to a range the moment its text happened to
  parse, and made an emptied selection produce a four-field string that removed
  every picker and stranded the person in a cron text box.
- An incomplete field is a first-class state, not a short expression:
  `formatCronExpression` throws, `withCronField` returns `null`, and the form
  names the unfinished field above a disabled Save. Never emit a partial rule.
- Switching a field's mode must not change which instants fire. Only `*` means
  unrestricted, and cron ORs day-of-month with day-of-week — so replacing `*`
  with an exhaustive `1,2,…,31` or `1-31` turns a weekdays-only rule into a
  daily one while looking like a representation change. From `*`, `list` and
  `range` start UNFINISHED; values carry over only between already-finite modes.
  When both day-of-month and weekday restrict, the editor states the OR out
  loud. Cover mode switches with real croner `match` assertions, not text.
- Cron day-of-week accepts 0 AND 7 for Sunday, so a RANGE must be expanded from
  its raw bounds and folded onto 0 only afterwards. Folding first turns `0-7`
  (every day) into `0-0` and reads it as Sundays only — a loss that is invisible
  until an unrelated time or zone edit rewrites the rule. Tests must cover a
  Sunday-7 range across an edit, not just its untouched round trip.
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
  columns per row and left Frequency and Next run visibly unaligned. The target
  column names the MACHINE as well as the agent and project — without it two
  same-named agents, and two chat-only rows, read identically.
- `schedule-format.ts` normalizes its `locale` argument with `toIntlLocaleOrEn`
  at every entry point, and is the only place here that constructs an `Intl`
  formatter. Callers pass the PRODUCT language, and Lody spells Chinese `zh_CN`,
  which every `Intl` constructor rejects with a RangeError — normalizing per call
  site means one missed caller crashes a page. Cover new formatters with the
  `zh_CN` render tests, not only pure-function tests: the formatters were already
  individually correct while the pages they back crashed.
- A row action must not be hover-only. Default it visible and hide it behind
  `[@media(hover:hover)]` so a touch device can still find it, and give any
  control whose only label is `hidden sm:inline` an explicit `aria-label`.
- `PropertyRow` sizes both tracks from content (`minmax(0,auto)` label,
  `minmax(0,1fr)` control), never from a `sm:` width. A viewport breakpoint
  cannot see the panel a schedule renders in, a hugging control track let the
  weekday toggles truncate the label away, and a hugging label track let a long
  translated label eat the row. `EditorInNarrowPanel` is the story that catches
  all three.
