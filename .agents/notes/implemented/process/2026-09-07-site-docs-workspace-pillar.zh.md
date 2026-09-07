# Site-docs：多模型工作空间支柱页

Status: implemented
Translation: current

[English](2026-09-07-site-docs-workspace-pillar.md) | 中文

## 摘要

`team.mdx` 已经写成员和机器共享，`parallel-agents.mdx` 已经写隔离的多 Agent 运行。两者都不是 “Claude Code team / Claude Code workspace / 多模型团队工作空间” 的耐久落地页。这次新增 `/docs/workspace` 作为枢纽：先说明 Lody 是团队工作空间这一层，再链出去，而不是重写那两页。代价是 Features 里多一个紧挨「团队」的 URL，两个标题必须能分开。

## 问题

搜 Claude Code *team* 或 *workspace* 的意图是产品形态，但 Lody 现有文档把故事拆开了：团队页是 ACL 和邀请，并行页是怎么同时跑，Agent Config 是怎么加运行时。把其中任何一页扩成支柱，要么重复其它页，要么把操作步骤埋掉。

## 决定

- 新增 `content/docs/{en,zh}/(features)/workspace.mdx`，并在两侧 Features `meta.json` 里紧挨 `team` 之后列出。
- 这一页只做枢纽：「需求 → 已有文档」对照表，外加 Settings → Workspace 和 Anthropic Team 套餐的短定义。不重写邀请步骤或完整并行工作流。
- 在 `llms-answers.mjs` 增加专问，链到 `/docs/workspace`、`/docs/team`、`/docs/agents`、`/docs/worktrees`——不链 `/docs/parallel-agents`（沿用既有 GEO 约束）。
- 从团队、并行、Agent Config 链过来。

未采用：把 `team.mdx` 改名为 workspace（会破坏已有的 `/docs/team`）；把支柱塞进 `parallel-agents.mdx`；声称 Lody *就是* Claude Code Team。

## 限制

若 Anthropic 日后推出带现场共享会话的官方 Claude Code 团队工作空间，「不是 Claude 专用产品」这句仍然成立，但搜索意图那段需要再看。后续同样改 Features `meta.json` 或 `llms-answers.mjs` 的文档 PR 合并时会冲突。
