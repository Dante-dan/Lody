# 会话编排异步链深度

Status: draft
Translation: current

[English](session-orchestration.md)

Agent 通过 Lody 委派异步工作时，每个委派目标都会从发起它的人类 Turn
继续同一条因果链。Lody 最多接受 32 次这样的跳转。已经处于深度 32 的
Turn 再发起命令时，会在创建 Operation 或目标 Session 之前被拒绝，并返回
不可重试的 `CHAIN_DEPTH_EXCEEDED` 错误。

这个深度表示因果委派次数，不是通用的 `parentSessionId` 树深度。创建
Session、向另一个 Session 发送工作、以及投递 Operation 完成通知，都会让
目标 Turn 增加一层。普通人类 Turn 缺少深度时从零开始。这个上限仍是共享
协议中的固定值；修改它必须同步更新所有生产者、恢复路径、可执行模型和本
Spec。

机器侧 Review Automation 在这条 MCP 委派链之外运行。它自己管理轮数、
Token 和权限预算，并根据外部的 Review 与 CI 状态推进。

## 本地与云端执行

OSS 的 Agent Role mention 必须无需 Lody 账号、无需经过产品云端认证请求即可
创建工作。Session/catalog MCP 调用进入持有本地 workspace 的 daemon，由正在
执行的 Turn 提供身份，校验精确的本机与项目，并运行与 Cloud 共用的 Role 解析
和持久化 Operation 状态机。支持已注册的本地项目和普通聊天；托管仓库上下文
仍不可用。

恢复使用冻结的 prompt、Role revision 和派发配置。重放缺失的目标输入前，
Cloud 确认远端文档追平；OSS 确认权威 daemon repo，并在已有创建 claim 下重新
检查固定 Turn。Cloud workspace 不能把云端断连当成本地权威。完成回传继续
使用已有的单一所有者 Delivery 协议，不需要持久化 schema 或托管 API 变更。

## 实现证据

实现检查位于 `apps/cli/src/mcp/lody-mcp-server.ts`，共享上限位于
`packages/shared/src/session-orchestration.ts`，可执行 Operation 模型位于
`apps/cli/src/orchestration/operation-model.ts`。

本草稿记录将上限改为 32 的请求。依赖安装后仍需补充运行时和已发布客户端
验收。

## 显式 create 配置

非 Role 的 MCP create 可为目标 Agent 请求显式 ACP `modeId` 与 `configOptionValues`。single 和 batch create 从目标公开 capability catalog 发现可选 mode id 与 option choices；acceptance 通过既有 CLI create 的目标 capability 与 machine access 检查验证，不支持或不可用的 selector 不允许替换成其他 mode。省略 selector 时保留既有默认值。

选择参与 Operation command identity，并冻结在已接受目标的 execution config 中，retry/recovery 不能静默改权限。显式 Agent Role 始终权威：manual mode/option 字段在验证、identity 和 dispatch 之前移除。这些 selector 不授予 machine/project access，也不改变 active requester identity。

本节为 #1172 的 draft intent，不声称本 revision 有人工批准。
