# Site-docs: multi-model workspace pillar

Status: implemented
Translation: current

English | [中文](2026-09-07-site-docs-workspace-pillar.zh.md)

## Abstract

`team.mdx` already covers membership and machine sharing; `parallel-agents.mdx` already covers isolated multi-agent runs. Neither is a durable landing for “Claude Code team / Claude Code workspace / multi-model team workspace.” This change adds `/docs/workspace` as a hub that states Lody is the team workspace layer, then links out instead of rewriting those pages. The trade-off is one more Features URL next to Team, so the two titles must stay distinct.

## Problem

Search intent for a Claude Code *team* or *workspace* is product-shaped, but Lody’s existing pages split that story: Team is ACL and invites, Parallel Agents is how to run several sessions, Agent Config is how to add runtimes. Expanding any one of them into a pillar would either duplicate the others or hide the how-to.

## Decision

- Add `content/docs/{en,zh}/(features)/workspace.mdx` and list it in both Features `meta.json` files immediately after `team`.
- Keep the page a hub: table of “need → existing doc,” plus a short definition of Settings → Workspace versus Anthropic’s Team plan. Do not restate invite steps or the full parallel workflow.
- Add a `llms-answers.mjs` question that links `/docs/workspace`, `/docs/team`, `/docs/agents`, and `/docs/worktrees` — not `/docs/parallel-agents` (existing GEO constraint).
- Link from Team, Parallel Agents, and Agent Config.

Rejected: renaming `team.mdx` to “workspace” (breaks the established `/docs/team` URL); stuffing the pillar into `parallel-agents.mdx`; claiming Lody *is* Claude Code Team.

## Limits

If Anthropic ships a first-party Claude Code team workspace with live shared sessions, the “not a Claude-only product” sentence still holds, but the search-intent paragraph should be revisited. Sibling docs PRs that also edit Features `meta.json` or `llms-answers.mjs` will conflict on merge.
