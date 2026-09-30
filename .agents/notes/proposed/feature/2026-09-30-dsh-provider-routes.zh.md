# 内置 Harness agent 的供应商限定路由

Status: proposed
Translation: current

[English](2026-09-30-dsh-provider-routes.md)

## 摘要

Lody 已读取 Harness 设置，但当前锁定的 ACP 适配器只展示一个 DeepSeek 供应商，因此现有 agent 无法使用自定义 `llm-pi-ai.providers` 路由。提案要求在选择和执行时保留供应商/模型身份，使用 Harness 支持的凭据引用，并在路由不可用时明确失败。适配器 PR #15 的 fork 分支已合并当前主线代码；Lody 宿主仍锁定旧适配器，也尚未验证桌面端或真实供应商请求。设置 Spec 仍为需要人工审阅意图的草案。

## 边界与顺序

- 保留一个内置 Harness 入口。适配器负责发现路由、选择器 ID、准确模型元数据、供应商调用与明确的故障；相同模型 ID 在不同供应商下必须保持区分。
- Profile 中默认挂载但不激活 `dsh-llm-pi-ai`。受支持的路由由 `settings.yaml` 提供，`apiKeyEnv` 指向宿主环境输入；密钥值不进入生成文件或共享工作区状态。
- 宿主安装使用适配器的精确包版本函数。适配器 PR 合并后更新 Lody 子模块锁定版本；profile 版本变化使缓存探针失效。修改目录后刷新能力并重连。保留 DeepSeek 原有路由与显式端点发现。
- 不增加产品专用启动器、第二个 Custom ACP 入口、任意插件或现有会话迁移。

## 证据与限制

[Lody #602](https://github.com/LodyAI/Lody/issues/602) 说明使用场景，并明确区分源码检查与端到端验证。Lody main `1cf6928` 锁定子模块 `c5a9d4d`；其中 `profile.ts` 的包闭包包含 `dsh-llm-pi-ai` 但未挂载，`adapter.ts` 只列出一个供应商。[适配器 PR #15](https://github.com/LodyAI/acp-extension-dsh/pull/15) 现有 fork head `1e63b0b` 已合并适配器当前 main `c5a9d4d`：build、37 项单测、格式和 diff 检查通过。当前 head 尚未运行固定版本的完整 profile smoke、Lody 桌面 UI 或真实供应商请求。适配器上游合并及宿主 pin 和集成检查完成前，不能声称运行时已经交付。

既有[设置 Spec](../../../../specs/deepseek-harness-settings.zh.md) 仍以草案记录预期行为；未发现本版本的人工批准。Lody fork PR 的 Context handoff 还要求作者对公开分享创作会话作出真实答复，不能编造。
