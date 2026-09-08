# Site-docs：Kimi vs Claude Code 对照页

Status: implemented
Translation: current

[English](2026-09-07-site-docs-kimi-vs-claude-code.md) | 中文

## 摘要

人们搜 `kimi vs claude code` 时，往往默认只能留一家。产品事实是：两者都是同一个 Lody 工作空间里的 Agent Config。这次新增仅给爬虫看的对比页 `/docs/compare/kimi-vs-claude-code`，说明什么时候用哪一个、怎么同时跑，并链到 Agent Config、并行 Agent 和 CLI 运行时。这一页不进文档侧边栏，Features 仍留给产品指南。代价是 URL 看起来像对打，正文则拒绝评测和替代宣称。

## 问题

`agents.mdx` 已经写了 Kimi Code（托管 Provider，以及 Claude 兼容端点）和 Claude Code。`parallel-agents.mdx` 也说过可以混用。但没有一页单独回答这条搜索，若把「vs」长文塞进 Agent Config，会把配置示例埋掉。

## 决定

- 新增 `content/docs/{en,zh}/compare/kimi-vs-claude-code.mdx`。不要把 `compare` 写进根或 Features `meta.json`，这样侧边栏看不到它，sitemap / 搜索 / `llms.txt` 仍会发出 `/docs/compare/kimi-vs-claude-code`。
- Lody 只作为工作空间这一层。把托管的 **Kimi Code** 和「Kimi 走 Claude 兼容端点」分开写。不编造延迟、质量或价格排名。
- 从 Agent Config（Kimi 节）、并行 Coding Agents、CLI 类型支持链过来。在 `llms-answers.mjs` 增加专问，且不链 `/docs/parallel-agents`（沿用既有 GEO 约束）。

未采用：把页面放进 Features 侧边栏和产品文档挤在一起；只写 blog（IA 更弱）；把长文写进 `agents.mdx`；编造 SWE-bench / 速度数据。

## 限制

Claude Code 的能力列表仍以 `claude-codex-capabilities.mdx` 为准。若 Kimi Code 日后改登录方式、或不再是托管 Runtime，本页应跟随 `agents.mdx`，而不是另写一套配置 SSOT。同批对比 PR 会共享 `generate-llms.mjs` 的 extras 列举和 `llms-answers.mjs`，合并顺序需要对这两处 rebase。
