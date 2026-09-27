# Grok 启动延迟的分段测量

Status: proposed
Translation: current

[English](2026-09-27-grok-startup-latency.md)

## 摘要

[Issue #282](https://github.com/LodyAI/Lody/issues/282) 报告 Grok runtime 1.0.13 在 Windows 上创建会话耗时 20–50 秒。当前 Lody 锁定 1.0.40，适配器等待模型快照最多只能在 runtime 回包后再增加约两秒。拟增加默认关闭的适配器计时，分别测量 runtime 等待、proxy 等待和首条 prompt 更新，不记录内容或标识符。尚未测量报告中的 Windows 场景及当前 runtime，因此这属于诊断，不能声称已修复延迟。

## 证据与决定

- 当前 `main` 锁定 Grok 适配器 `217688166de3b5b2bb37723537d71188a3241ec1` 和官方 runtime 1.0.40。适配器收到 runtime 的 `session/new` 回包后才启动两秒回退定时器。现有 proxy 测试覆盖迟到的模型快照与回退。
- issue 日志显示 `connection.newSession` 调用本身等待超过十秒。Lody 在调用前还构造 MCP server 列表；这条等待日志说明至少一部分延迟发生在该步骤后，但未标明 runtime 回包和客户端发出的时间点。
- [Grok Build 官方更新日志](https://x.ai/build/changelog)称 1.0.14 将 MCP 工具和其他启动工作移到后台，让新会话更快返回；1.0.15 移除了首条消息等待仓库状态扫描的问题。这两个版本晚于报告所用的 1.0.13，早于当前 1.0.40。更新日志不能证明报告中的 Windows 场景已经修复。

[参考适配器 diff](https://github.com/Dante-dan/acp-extension-grok/compare/217688166de3b5b2bb37723537d71188a3241ec1...ae5b745d4fbed915ad77533b666df37d07256f5c) 只在脱敏诊断时通过 `LODY_GROK_ACP_TIMING=1` 启用。适配器记录转发 `session/new` 到 runtime 回包、回包到客户端发出、转发 `session/prompt` 到首个客户端更新的毫秒数。输出不包含请求 ID、会话 ID、提示词、回复或 MCP 详情。默认行为及协议消息不变。

如果 1.0.40 下主要时间耗在 runtime，应先调查 runtime/MCP 启动，再考虑修改模型快照等待；如果主要耗在 proxy，应在保留迟到快照和回退契约的前提下收窄适配器等待。此分支有确定性计时测试及现有适配器测试，但没有 Windows 或官方 runtime 实测，不能声称 issue 已解决。
