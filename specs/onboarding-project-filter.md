# Connected project filtering

Status: draft
Translation: current

[中文](onboarding-project-filter.zh.md)

A user with many connected projects can find a project without scrolling the entire list. The Projects step offers an always-visible filter when projects exist. Filtering matches owner/repository names, local names/paths, and displayed visibility metadata, ignoring case and surrounding whitespace. Filtering is local over already-loaded entries and never sends the query to a server.

The header reports matching and total counts while filtering. An empty result explains the query and offers Clear filter. Filtering never changes the selected project or the Back, Skip, and Next actions. The existing selection is singular; this proposal does not introduce multi-select.

The input receives focus when the list mounts. Arrow keys move focus through matching rows; Enter selects the focused row (or first match from the input), without advancing the step. Escape clears the query and returns focus to the input. Normal Tab navigation remains available.

## Evidence

- [Request #1386](https://github.com/LodyAI/Lody/issues/1386), also filed as #1387.
- [Project picker](../packages/components/src/components/onboarding/screens/projects-screen.tsx).
- [Decision](../.agents/notes/proposed/feature/2026-10-10-onboarding-project-filter.md).
