# Kimi 自发轮次需要明确的运行状态边界

Status: proposed
Translation: current

[English](2026-10-02-autonomous-kimi-session-liveness.md)

## 摘要

[#272](https://github.com/LodyAI/Lody/issues/272) 报告后台任务唤醒模型并继续输出时，会话仍显示空闲。当前托管 Kimi 已在脱离前台的 agent 子任务及其唤醒轮次结束前保持 prompt 请求，覆盖了这一子范围。但 prompt 已结束之后，运行引擎仍能主动开新轮次并输出，而没有发布根轮次运行状态信号。建议增加经过协商、按 ACP activation 隔离的根活动快照，并将显示租约与真人轮次权限分开；本说明没有改变生产行为。

## 证据及覆盖

Lody `cf5482061968a5917337b39b31cf7ec9ae7f5d85` 的 Kimi manifest 固定到 `743c6641b89870dbd0596d1726ae4d34d42844e2`。其中 `packages/acp-server/src/session.ts` 跟踪正在运行的轮次，将 prompt 结束原因保留至 agent 子任务、唤醒宽限期及轮次全部排空。任务集合只统计 `kind=agent`。已有 `lody-session-updates.test.ts` 另有 prompt 结束之后由引擎自行开轮次的行为案例；此时内容仍转发，但客户端 prompt 不重新进入等待。

Lody 的 `enqueueACPUpdate` 将这些输出绑定到已经结束的 assistant entry；原执行作用域结束时也释放活动 presence。`resolveSessionLiveStatus` 仅检查 presence、前台执行和待派发工作。因此历史内容投递本身不意味着运行状态。Core 的 activity 只表示压缩及重试；任务生命周期与子 agent 事件也不代表根会话执行。

这证明独立根轮次缺少状态边界，不意味着原报告的全部旧版本任务都仍然失败。原文没有明确任务类型，不能把已经采纳的子 agent 修复扩展成整 issue 已解决。

## 建议边界

Core 应提供版本化的根活动能力协商。持有主 agent 原生事件的 adapter 在开始及结束时发送有界的根轮次活动快照，包含 ACP activation 及单调递增序号。新 activation 使旧快照失效。客户端仅接受已协商能力、当前 ACP session 和 activation 的快照；过期序号不能重新激活会话，断连释放显示租约。

Daemon 将其租约与普通 prompt 执行合并为显示状态：根轮次结束不能清除并行真人 prompt，真人 prompt 结束也不能清除仍在进行的自主活动；等待权限仍优先。处理快照不得刷新用户空闲计时器，不得虚构真人 requester、user turn、invocation、历史 entry、steer 归属或 replay 权限。晚到输出继续使用现有 assistant entry 归属。

不采用静默超时或每个文字 chunk 写 durable running 的方案：晚到尾部输出不证明何时开始或结束，而且没有活动 presence 的 durable running 违反当前边界。子 agent 生命周期也不足以覆盖进程唤醒和定时根轮次。

## 验证及下一步

当前 Lody live-status 和 transient-store 共 29 个测试通过。直接执行当前 Kimi 排空函数的合成状态实验验证了四条分支：agent 子任务、唤醒宽限期、根轮次阻止提前结束；全部排空后才返回 `end_turn`。Docs check 没有错误。未执行隔离 Kimi 的集成测试，也未复现 Kimi 0.39.1/macOS 原始环境。

下一可执行动作是定义最小 Core 快照协议，连接 Kimi 事件发布与 daemon 显示租约，并在原有行为测试中覆盖自主开始结束、乱序快照、断连、新真人轮次重叠及权限等待。改变保证时应新增 draft Spec；本文没有声称真人批准，也没有增加实现前审批门槛。
