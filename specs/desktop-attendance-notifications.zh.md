# 桌面在场状态与移动端通知

Status: draft
Translation: current

[English](desktop-attendance-notifications.md) | 中文

同一用户正在桌面端使用 Lody 时，发送到其手机的完成和权限推送属于重复提醒。
桌面端在工作区内发布短时有效的在场事实；托管通知发送端在实际发送时读取该事实，
并跳过移动端投递。桌面端连续 60 秒没有活动后，恢复移动端投递。
桌面原生通知继续沿用现有的前台检查。

## 在场判定

桌面应用实例只有同时满足以下条件时才算在场：

- 文档可见；
- 窗口有焦点；
- 最近 60 秒内发生过有效用户交互。

有效交互是离散的键盘、指针点击或触摸操作。指针移动、动画帧、渲染、网络活动、
Agent 输出和机器在线状态都不代表用户在场。仅有焦点或可见性、但没有近期交互也不够。

60 秒窗口从文档可见且有焦点时观察到的最近一次有效交互开始计算。失焦或隐藏后不再
延长窗口，也不能把机器在线解释成用户在场。发布端会清除过期条目，同时容许条目在
传输中丢失或自然过期。

## Presence 契约

Renderer 在工作区 presence 通道中，按“已认证用户 + 桌面应用实例”发布一个
`desktop-attendance` 条目。该固定结构只包含用户 ID、临时实例 ID、最近在场时间戳和
发布时间戳，不包含会话文本、输入内容、设备指纹或交互历史。

在场开始时可以立即发布；之后最多按现有 30 秒 presence 心跳频率刷新一次。
原始输入事件只更新本地状态，绝不能每次输入都写一次 presence。条目使用稳定 key 并
覆盖旧值，读取端只依赖最新状态。这些上限属于共享的
[临时 presence 预算](loro-ephemeral-presence-channel.zh.md)。

只有在场时间戳仍处于 60 秒窗口内、且条目自身仍新鲜时，才可抑制移动端投递。
格式错误、缺失、过期或无法读取的 presence 快照都不得抑制推送。这个故障时继续提醒的
策略保证纯手机使用和连接故障期间的通知行为不变。

## 投递职责

公开桌面端负责观察并发布在场状态。托管通知发送端负责最终接收者决策，因为它在发送
时拥有最新的工作区 presence 和设备列表。CLI 继续通过 `CloudNotificationsPort` 上报
会话完成和权限请求；它不把某一时刻的在场快照塞进这些调用，本地组合仍然没有云通知能力。

对一次通知事件，目标用户任一新鲜的在场条目只抑制该用户移动设备上的推送。
它不抑制其他用户的设备，不改变收件箱持久记录，不结束 Live Activity，也不改变底层完成
或权限记录。多个桌面实例采用 OR 语义：任意一个实例新鲜即可。

桌面原生的完成和权限横幅继续沿用本地焦点与可见性规则。本契约不把在线 Machine presence
当作代理，不要求手机应用关闭，也不把托管 OneSignal 实现移入公开仓库。

## 证据与批准

当前会话级可见信号由
[`use-publish-session-viewing.ts`](../packages/components/src/hooks/use-publish-session-viewing.ts)
经
[`workspace-presence-transport.ts`](../packages/components/src/providers/workspace-presence-transport.ts)
发布。Presence 结构和新鲜度位于
[`packages/shared/src/presence.ts`](../packages/shared/src/presence.ts)，通知边界是
[`CloudNotificationsPort`](../packages/platform/src/cloud-port.ts)。

需求：[Issue #527](https://github.com/LodyAI/Lody/issues/527)。
本草案只定义拟议意图；它没有批准或实现桌面在场发布端与托管抑制逻辑。
实现前必须取得对本 revision 的明确人工批准。
