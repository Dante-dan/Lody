# Site-docs: Kimi vs Claude Code bridge

Status: implemented
Translation: current

English | [中文](2026-09-07-site-docs-kimi-vs-claude-code.zh.md)

## Abstract

People search `kimi vs claude code` as if one vendor must win. The product fact is that both are Agent Configs in one Lody workspace. This change adds a durable Features page at `/docs/kimi-vs-claude-code` that explains when to reach for which and how to run both, then links to Agent Config, parallel agents, and CLI runtimes. The trade-off is a compare-URL that looks competitive, while the copy refuses benchmarks and replacement claims.

## Problem

`agents.mdx` already documents Kimi Code (managed provider plus Claude-compatible endpoint) and Claude Code. `parallel-agents.mdx` already says you can mix them. Neither page answers the search query in one place, and stuffing a “vs” essay into Agent Config would hide the setup examples.

## Decision

- Add `content/docs/{en,zh}/(features)/kimi-vs-claude-code.mdx` and list it in both Features `meta.json` files after `parallel-agents`.
- Keep Lody as the workspace layer. Distinguish managed **Kimi Code** from “Kimi over a Claude-compatible endpoint.” Do not invent latency, quality, or price rankings.
- Link from Agent Config (Kimi section), Parallel Coding Agents, and CLI Runtime Types. Add a dedicated `llms-answers.mjs` question that does not link `/docs/parallel-agents` (existing GEO constraint).

Rejected: blog-only compare (weaker IA); putting the essay on `agents.mdx`; fake SWE-bench / speed claims.

## Limits

Capability lists for Claude Code stay on `claude-codex-capabilities.mdx`. If Kimi Code later advertises a different sign-in or stops being a managed runtime, this page must follow `agents.mdx` rather than invent a second setup SSOT. Sibling docs PRs that also edit Features `meta.json` or `llms-answers.mjs` will conflict on merge.
