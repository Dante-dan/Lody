# 受监督的独立 Session

Status: draft
Translation: current

[English](supervised-opened-sessions.md)

Agent 可以创建独立 Session，在自己的本地项目目录里工作；用户仍留在发起工作的对话中监督。
新 Session 需要独立文档和执行环境，但进度、结果、未读提醒和权限请求应回到发起对话。
显式交接则会创建用户自己接管并直接访问的同级对话。这是针对 [#529] 的意图草案，
尚无对应修订的人类明确批准，也不授权现在改变运行时行为。

## 关系与展示

`openedBySessionId` 记录准确的发起者，包括子 Tab；`openedByRootSessionId` 提供可路由的根。
两者都不能单独判断新 Session 是受监督的工作，还是交接。创建时必须持久保存这个选择，
让重连、其他设备和历史展示不必根据机器是否在线、侧栏状态或是否存在 worktree 猜测。
尚无此标记的旧 Session 在迁移方案确定前保持原有展示。

受监督 worker 仍是独立 Session 文档，拥有自己的 `workContext` 和运行时。
发起对话展示 worker 列表、数量、状态和简短结果，并允许进入完整对话。
普通完成通知和未读提醒显示在发起对话，不为每个 worker 新增一条独立收件箱项。
权限请求也必须通过发起对话送达用户，并标明准确 worker 和请求；路由失败不得默许或静默丢弃。

worker 的 Operation `output` 为发起对话提供结果预览。worker 有结果后，仅显示
“Session created”不足以说明结果。列表只在有证据时区分运行中、等待权限、已完成、
失败和观察状态未知；机器暂时断线不等于完成，也不等于用户正在查看发起对话。
结清已结束的 worker 只将其移出活动列表，不删除文档。批量移除只处理适合结清的
已结束 worker，不影响正在运行的工作或待处理权限请求。

显式交接创建拥有独立收件箱、未读和通知行为的同级 Session。用户主动创建的手机专用
对话也保持独立。不能因 Agent 选择了不同机器或项目，就推断用户要交接。交接在界面
和协议中的准确字段仍待审阅。

## 分阶段交付与兼容

若分阶段交付，应先把提醒和权限等待路由好，再把 worker 行藏到面板里；单独增加面板会
遮住用户必须回应的工作。必须保留独立 `workContext` 创建能力；默认改成
`useCurrentSessionAsParent` 会变成共享父工作区的子 Tab。现有
[Session 关系契约](session-relations.zh.md) 继续决定归档、恢复和删除目标；结清只是
展示状态，不改变这些目标。另一个 [Spec](subagent-events.zh.md) 中的原生 provider
subagent 事件与通过 MCP 创建的 Lody Session 是两类对象。

实现前需要审定持久化的监督／交接字段、发起者消失或不可用时的权限路由，以及本地、
云端、桌面和移动端的通知汇总范围。验收应覆盖并发隔离的工作目录、发起者为 Tab、
重连、权限等待、Operation 完成和失败、结清但不删除、显式交接，以及旧 Session 兼容。
本文档提案没有声称已完成这些运行时测试。

## 证据与边界

场景和目标来自 [#529](https://github.com/LodyAI/Lody/issues/529)。已检查的 MCP
创建路径是 [`lody-mcp-server.ts`](../apps/cli/src/mcp/lody-mcp-server.ts)：本地 Agent
Role 在没有 `workContext` 时，当前默认选择 `useCurrentSessionAsParent`。
[`session.ts`](../apps/cli/src/commands/session.ts) 禁止把该父级关系与独立项目／
worktree 同时使用。当前 [`notification-service.ts`](../apps/cli/src/lib/notifications/notification-service.ts)
的完成通知目标是 worker Session id。“Session created”卡片位于
[`created-session-operation-card.tsx`](../packages/components/src/components/ai-gui/created-session-operation-card.tsx)。
这些是提案修订时的源码观察，不代表已验证线上行为。
