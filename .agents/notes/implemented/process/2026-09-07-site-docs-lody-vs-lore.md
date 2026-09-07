# Site-docs: Lody vs Lore compare page

Status: implemented
Translation: current

English | [中文](2026-09-07-site-docs-lody-vs-lore.zh.md)

## Abstract

Search and sales conversations collapse “share my session” into one idea, so a Lore-style read-only link is easy to treat as a teammate joining the live coding-agent session. The how-to already lives on `/docs/session-handoff`; this change adds a durable Features compare page at `/docs/lody-vs-lore` that owns the definition contrast, links back to handoff for steps and ACL, and emits FAQ / `llms.txt` answers. The trade-off is a competitor-named URL in exchange for a page that can stay next to the product guide instead of becoming a one-off blog rant.

## Problem

`session-handoff.mdx` already has a comparison table that mentions Lore and SpecStory. That page is the permission and how-to SSOT. Expanding it further would bury the definition, while a blog-only rant would rot after the campaign. GEO questions such as “is a Lore share link a handoff?” also need an answer block that can link a current English docs path.

## Decision

- Add `content/docs/{en,zh}/(features)/lody-vs-lore.mdx` and list it in both Features `meta.json` files immediately after `session-handoff`.
- Keep every access rule identical to `session-handoff.mdx`: workspace membership, machine sharing, local project sharing, and “URL copy ≠ Share with team…”. Do not invent a public share-link ACL.
- Characterize Lore and SpecStory only as the share-link / archive category already documented on the handoff page (view or fork a record; viewers do not join the running session). Do not add benchmarks or a replacement claim.
- Point handoff, team, parallel-agents, copy-md, and the existing handoff blog at the compare page. Add a dedicated `llms-answers.mjs` question plus a link from the existing handoff answer.

Rejected: renaming the slug to `share-link-vs-handoff` (more generic, weaker GEO for the named contrast); putting the contrast only on the blog; restating the full four-step how-to on the compare page.

## Limits

Lore and SpecStory product details are limited to what the existing Lody docs already state plus their public share/docs URLs. If either product later offers true live-session join, this page must be revised rather than stretched. Merge of later docs PRs that also edit Features `meta.json` or `llms-answers.mjs` will need a rebase.
