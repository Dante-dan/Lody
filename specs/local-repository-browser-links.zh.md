# 本地仓库浏览链接

Status: draft
Translation: current

[English](local-repository-browser-links.md)

## 场景

用户把已经克隆的 GitLab 或其他 Git 仓库加入本地项目后，可从新对话工具栏
在浏览器中打开仓库，无需 GitHub 账号或 GitLab API 集成。这是
[Issue #261](https://github.com/LodyAI/Lody/issues/261) 的候选导航切片，不是合并请求支持。

## 职责与行为

目录所在机器读取 Git 远端配置。先查当前分支所配置远端的 push、fetch URL，
再查 origin；两者均无时可使用唯一远端。返回第一个安全的浏览 URL。
HTTP/HTTPS 保留网页端口；SSH 转为 HTTPS，并移除 SSH 端口。保留嵌套分组，
移除用户信息、查询参数与片段。本地路径、不支持的传输和路径段不显示浏览动作。
此链接不用于判断 provider，也不启用 GitHub 工作流。

渲染器仅在机器公布 `localProjectBrowserLinks: 1` 时请求可选响应字段。
旧请求保持原来的严格响应形状。缺少 capability 或 URL 时隐藏动作。
Electron IPC 与 Streams RPC 使用相同的显式选入参数。渲染器再次检查 URL，
然后调用现有外部链接端口。

项目保持本地属性；不新增账号发现、令牌存储、API 请求、合并请求审阅、
写操作或持久化项目元数据。

## 证据与限制

- [远端解析](../packages/shared/src/worktree-paths.ts)
- [Git 状态](../packages/shared/src/node/local-project.ts)
- [协议门面](../packages/components/src/providers/workspace-machine-rpc-facade.ts)
- [决策笔记](../.agents/notes/proposed/feature/2026-10-04-local-repository-browser-links.zh.md)

此草案未经人工批准。SSH 主机与网页入口不同的自建部署，需要后续明确的映射设计。
