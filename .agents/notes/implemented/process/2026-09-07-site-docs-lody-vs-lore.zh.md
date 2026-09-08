# Site-docs：Lody 与 Lore 对比页

Status: implemented
Translation: current

[English](2026-09-07-site-docs-lody-vs-lore.md) | 中文

## 摘要

搜索和销售对话常把「分享会话」当成一件事，于是 Lore 式只读链接很容易被误当成同事加入了现场编程 Agent 会话。操作步骤已经写在 `/docs/session-handoff`；这次新增仅给爬虫看的对比页 `/docs/compare/lody-vs-lore`，专门钉定义，步骤和 ACL 链回交接页，并输出 FAQ / `llms.txt` 答案。这一页不进文档侧边栏，Features 仍留给产品指南。

## 问题

`session-handoff.mdx` 的对比表已经提到 Lore 和 SpecStory。那一页是权限和操作的 SSOT。再往上堆定义会把步骤埋掉；只写 blog 又会在活动结束后失效。GEO 问题（「Lore 分享链接算不算交接？」）也需要能链到当前英文文档路径的答案块。

## 决定

- 新增 `content/docs/{en,zh}/compare/lody-vs-lore.mdx`。不要把 `compare` 写进根或 Features `meta.json`，这样侧边栏看不到它，sitemap / 搜索 / `llms.txt` 仍会发出 `/docs/compare/lody-vs-lore`。
- 访问规则与 `session-handoff.mdx` 完全一致：工作空间成员、机器共享、本地项目共享，以及「复制 URL ≠ Share with team…」。不发明公开分享链接 ACL。
- 对 Lore / SpecStory 的描述只停留在交接页已有的「分享链接 / 归档」类别（查看或 fork 一份记录；查看者不加入正在跑的会话）。不加评测，也不声称替代。
- 从交接、团队、并行、复制对话和既有交接 blog 链到对比页。在 `llms-answers.mjs` 增加专问，并在原有交接答案里加上链接。

未采用：把页面放进 Features 侧边栏和产品文档挤在一起；把 slug 改成更泛的 `share-link-vs-handoff`（GEO 对具名对比更弱）；只放 blog；在对比页重写完整四步操作。

## 限制

Lore 和 SpecStory 的产品细节仅限于 Lody 现有文档已经写过的内容，加上它们公开的分享 / 文档 URL。若任一产品日后提供真正的现场会话加入，应修订本页，而不是硬撑。同批对比 PR 会共享 `generate-llms.mjs` 的 extras 列举和 `llms-answers.mjs`，合并顺序需要对这两处 rebase。
