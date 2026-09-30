# MCP create 的显式 ACP 权限选择

Status: proposed
Translation: current

[English](2026-09-30-mcp-explicit-create-permissions.md)

## 摘要

非 Role MCP create 缺少 CLI create 已支持的权限 selector（#1172）。本方案接受显式 `modeId`，公开目标提供的 choices，并委托既有 create 边界验证。Operation identity 和已接受的 execution config 保留该选择；Role 配置继续权威。新增 MCP intent 在 [Session orchestration](../../../../specs/session-orchestration.md) 保持 draft，等待人工 review，不冒称安全政策已批准。

## 决策与边界

使用具体 ACP selector，不创造通用权限词汇：各 agent mode 不同，Grok 不应收到未声明的 builtin 默认 mode（#606/#607）。`validateSessionCreateOptions` 在 Operation acceptance 前读取目标 capability，拒绝无效 mode/option，保持 machine authorization。语义 model/effort/fast/plan 映射不变，已解析 selector 保持现有优先级。Role create 通过既有 override-field projection 移除 manual concrete 字段。

single/batch schema 共享 selector。canonical command fingerprint 包含显式 mode，已有 accepted target dispatch config 将其冻结用于 recovery。discovery 仅公开 mode id/name，不公开凭据或 launch config。任意 ACP option 字典不在本变更范围内。不改变 provider 默认、machine access、Role 归属或 permission consent 政策。issue 中更宽政策讨论留给维护者 review 本 draft，不将扩权决定归于人类。

## 验证

MCP、discovery 和 session command suite 共 135 个测试通过；更新后的 MCP suite 再次通过 38 个测试。CLI typecheck、root formatting 与文档检查通过。root `pnpm check` 首次因 Devin adapter 缺少依赖停止；frozen install 补齐依赖，但 Electron postinstall 无权限写 host cache。root check 重试结果在交付中单独记录。未复现真实 provider 权限弹窗或桌面行为，不声称上游批准。
