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

接入生产路径前需要审定持久化的监督／交接字段、发起者消失或不可用时的权限路由，以及本地、
云端、桌面和移动端的通知汇总范围。验收应覆盖并发隔离的工作目录、发起者为 Tab、
重连、权限等待、Operation 完成和失败、结清但不删除、显式交接，以及旧 Session 兼容。
有限参考实现
[`supervised-opened-session.ts`](../packages/shared/src/supervised-opened-session.ts)
接收显式关系和观察状态，不改变持久化 Session 元数据。只有发起根对话的路由可达时，
才汇总 Tab 发起的 worker；否则保留 worker 的收件箱。权限等待优先于完成和结清，
运行中或状态未知的工作不能结清。行为测试覆盖这些决策。生产创建意图、parent 结果与许可展示、
完成通知路由和未读关注已在下文实现；worker 列表结清与许可推送分组仍未实现。现有创建进度卡独立携带创建 Operation 的有界结果
预览；只有进度卡保留该预览时，完成卡才去重隐藏。这一部分不隐藏 worker，
也不改变权限归属。

## 证据与边界

场景和目标来自 [#529](https://github.com/LodyAI/Lody/issues/529)。已检查的 MCP
创建路径是 [`lody-mcp-server.ts`](../apps/cli/src/mcp/lody-mcp-server.ts)：本地 Agent
Role 在没有 `workContext` 时，当前默认选择 `useCurrentSessionAsParent`。
[`session.ts`](../apps/cli/src/commands/session.ts) 禁止把该父级关系与独立项目／
worktree 同时使用。当前 [`notification-service.ts`](../apps/cli/src/lib/notifications/notification-service.ts)
的完成通知目标是 worker Session id。“Session created”卡片位于
[`created-session-operation-card.tsx`](../packages/components/src/components/ai-gui/created-session-operation-card.tsx)。
这些是提案修订时的源码观察，不代表已验证线上行为。

## 持久化创建意图切片

新的独立 MCP 创建接受 `openedSessionMode: supervised | handoff`，默认值是
`supervised`。单项和批量 Command 在接受 Operation 前冻结该值；daemon 恢复将其与
精确 opener 和 root 指针一起写入 Session 元数据。子 Tab 已有 parent 关系，不保存
此选择。普通 CLI 创建和缺少该字段的旧 Operation 仍保持历史 peer 行为；恢复不会
从来源指针推断监督关系。显式 handoff 保留独立会话身份。

本切片不隐藏 worker inbox，也不改变权限请求归属。关注与完成通知路由
需要已验证的 parent attention 路由及 worker 后备。现有
Operation 结果预览仍是唯一生产 parent 结果展示。本改动不宣称桌面或移动端实机
验证，也不宣称人类批准了 Spec。

监督进度卡现在也在 opener 展示 worker 的持久化权限等待摘要，用户可打开 worker
处理原始请求。等待解除时标记消失，旧 Operation 完成状态不能清除权限等待。
历史 peer、handoff 和子 Tab 卡保持原行为；本注意力展示不重定向云通知、不隐藏
worker 行。

普通完成通知在 opener root 元数据确定、未归档且属于通知接收者时指向 root；
元数据缺失、归档、其他用户或 root 实为子 Tab 时回退 worker。权限请求身份仍
在 worker。现有相关会话树保留计数和导航，在无机器实时 presence 时也显示监督
权限等待。专用 roster settlement 和权限推送分组仍未完成。

## 发起会话未读汇总

侧栏与会话首页使用仅供呈现的关注映射，把明确受监督的独立 worker 及其子 Tab
汇总到已知、活跃且同属一个用户的根会话。worker 行与独立工作目录保持不变。
未读仍由各会话自己的阅读回执决定；查看根会话不会把未查看的 worker 输出标为已读。
持久化许可等待在没有在线状态时仍可见，Working 仍仅依赖在线状态。Dock 对已汇总
关注只计数一次；根会话缺失、关闭、归档或属于其他用户时保留 worker 回退。此映射
不选择归档、恢复或删除对象。收起已完成 worker 与许可推送分组仍未完成，Spec 仍是草案。

完成通知与本地未读汇总使用一致的有效发起者条件：已关闭的发起者不再作为通知目标，改为保留 worker 后备路由。权限请求标识仍属于原 worker。

## 生产创建 roster 的收起操作

创建进度按 worker 分组并显示活跃数量。已结束且没有权限等待的监督 worker 可单项或批量收起。收起只向独立 Session 元数据字段写入创建 Operation 的标识，不改变文档、生命周期目标、已读标记或权限请求身份。运行中、未结束、handoff 或待权限的 worker 不符合条件。写入前重新核对归属、持久化权限等待和当前 presence；worker 恢复运行或出现新权限等待时重新显示卡片和数量。已收起 worker 保留紧凑导航链接。此列表属于创建 Operation，不是跨 Operation 的监督控制台。

权限 push 分组仍需独立协议支持：公开通知和回应 API 只有属于原 worker 的 `sessionId` 和请求身份。需要另加注意力目标及兼容的托管消费者，不能直接替换原会话标识来分组。
