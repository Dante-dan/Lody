# 不引入 provider 身份的本地仓库导航

Status: proposed
Translation: current

[English](2026-10-04-local-repository-browser-links.md)

## 摘要

GitLab 目录已经能作为本地项目使用，但缺少仓库浏览动作。本参考实现增加不含
凭据的远端导航，保持 GitHub 身份和工作流不变。显式机器 capability 避免向严格
解析的旧端发送新字段。提案仅覆盖导航，合并请求审阅范围尚未确定。

## 决策

[Issue #261](https://github.com/LodyAI/Lody/issues/261) 的公开讨论提出只读 MR 审阅
或远端识别与浏览链接两个切片。本提案选择后者，不声称维护者已批准。
直接增加 provider 联合类型，会在 MR 流程尚未确定时把 GitLab 身份扩散到现有
GitHub 会话、PR 与归档契约。导航 URL 不需要认证、存储迁移或 provider API。

远端优先级为分支配置远端、origin、唯一远端。共享解析器移除凭据，拒绝不支持
的 URL 和路径。机器仅在 `includeBrowserUrl` 选入后返回 `repositoryBrowserUrl`；
界面协商 `localProjectBrowserLinks: 1` 后请求，并再次检查返回链接。
SSH 转 HTTPS 无法判断自建服务是否使用不同网页入口。

行为由[草案 Spec](../../../../specs/local-repository-browser-links.zh.md)描述。
相关[原生交互](../../../../specs/desktop-native-interactions.md)仍负责平台动作，
本提案不增加浏览器传输。

## 验证

所属测试套件覆盖远端解析、真实本地 Git 状态、工具栏链接安全和 capability 协商。
仓库检查按实际结果报告；参考实现不代表人工批准、真实 GitLab API 验证或完整 MR 支持。

两个 shared 套件通过 56 项测试，两个 components 套件通过 37 项。
Shared 与 Streams RPC 类型检查、格式、文档、翻译、快速 lint 和公共边界检查通过。
根 `pnpm check` 在 ACP adapter 准备阶段因现有 Devin checkout 缺少依赖而停止。
Components 类型检查仍受未改动 Markdown 使用者缺少 `github-slugger` 声明限制。
未执行打包 Electron 的视觉验证。
