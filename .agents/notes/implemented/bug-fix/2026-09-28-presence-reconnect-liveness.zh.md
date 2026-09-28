# Presence 重连期间的机器在线状态

Status: implemented
Translation: current
English：[presence-reconnect-liveness.md](2026-09-28-presence-reconnect-liveness.md)

## 摘要

Presence 房间曾经加入成功后，即使进入重连，CLI 和 MCP 读取端仍可能把旧的空快照当作机器离线的证据。聊天列表也会把未同步的 presence 集合显示成“离线”。现在读取端要求房间当前已加入，MCP 在一次快照完成后重新读取，界面仅在订阅已同步时宣称离线。当前已加入的房间若确实没有新鲜心跳，仍可判为离线；本改动不修复独立的心跳投递停滞。

## 证据与决定

[问题 #484](https://github.com/LodyAI/Lody/issues/484) 指出 `null` 应表示未知，后续又记录了已加入 → 重连且返回空 `Set` 的场景。`CliPresenceRuntime.waitUntilJoined()` 原用 `joinedOnce`，重连时仍为真；`makeMachineLivenessLookupForMcp()` 会在整个查询生命周期保留已完成的 Promise。界面已有三态 presence atom，但聊天和侧边栏列表只凭集合成员关系判断“离线”。

保留现有心跳新鲜度谓词及三态契约。房间进入任何非 joined 状态时撤销已加入证据，下一次 joined 再恢复。MCP 在同批并发读取中只共用尚未完成的读取；下次查询重新检查。界面订阅未同步时，已知机器仍可选择，其会话不进入“离线”分组。真实可达性未知的请求继续依照自身期限处理。

若把所有空 `Set` 都视为未知，就会掩盖健康同步房间中的真实离线。新增按时长计算的宽限期会改变既有 90 秒心跳契约，也没有证据证明其能修复独立的投递队列问题。

## 验证与限制

CLI 定向测试覆盖 joined → reconnecting → joined，以及先得到空快照、再无法读取 presence 的情况。现有组件 presence 测试覆盖已同步与断线时的三态解释。没有在真实 Linux daemon 上复现报告的十秒断线；若房间始终未重新加入，那仍属于 transport 恢复问题。本改动处理恢复期间错误的在线状态结论。

相关意图：[ephemeral presence channel Spec](../../../../specs/loro-ephemeral-presence-channel.md) 与 [presence channel budget 记录](../architecture/2026-09-20-ephemeral-presence-channel-budget.zh.md)。
