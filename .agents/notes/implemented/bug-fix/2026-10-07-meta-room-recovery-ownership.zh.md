# 保留元数据房间正在进行的 Streams 恢复

Status: implemented
Translation: current
Related: [English](2026-10-07-meta-room-recovery-ownership.md)

## 摘要

CLI 看门狗可能在聚合传输仍可用时打断元数据房间的恢复。当前 Streams 适配器
按房间重试，但 `StreamsCrdt.rejoin()` 仍会重置退避并中止正在重连的请求。
自动控制器轮次现在保留房间已有的恢复过程；房间终态失败和显式强制重连仍走
原有恢复路径。现有控制器回归测试验证最终就绪，没有复现真实丢包网络。

## 决定与证据

[Issue #399](https://github.com/LodyAI/Lody/issues/399) 描述看门狗不断重启较慢
的元数据房间恢复。在 `loro-repo` 0.21.1 和 `streams-crdt` 0.16.1 中，适配器
的重连扫描包含 `reconnecting` 房间。持久化 `StreamsCrdt` 实现保护写入健康时
的 `connecting` 读取，但进行中的读取重试会报告 `reconnecting`：此时
`rejoin()` 清空重试状态并中止请求。当前问题是房间级中断，并非已经证明
当前适配器会拆除整个传输。

当聚合状态不是 `disconnected` 时，非强制轮次保留元数据房间的
`connecting`/`reconnecting` 恢复。跳过的轮次不算控制器恢复失败，也不再安排
下一次重连。房间库拥有重试；`error`/`disconnected` 及显式强制重连仍进入
控制器恢复。真正的聚合断开路径保持原样，不改变公开协议或 Spec 意图。

这里没有另加房间加入截止时间，否则会在已有请求失败管理和退避之外新增
重试负责人。[已关闭、未合并的 PR #478](https://github.com/LodyAI/Lody/pull/478)
曾提出保留进行中的元数据加入，该范围为本次调查提供参考；本次独立追踪了
当前依赖的重试和终态路径。[本地房间恢复记录](2026-09-17-local-loro-join-recovery.zh.md)
描述不同的 Electron relay 边界上类似的恢复归属。

## 验证与限制

新增的 `tests/reconnect-storm-repro.test.ts` 慢房间场景在未修改的控制器上
经过 90 秒模拟时间仍为 `reconnecting`。修复后，原始尝试进入 `joined`，并且
仅发布一次在线信号。终态 `error`/`disconnected` 与强制重连对照仍能恢复健康。
加上 `connection-recovery.test.ts`，全部 19 项通过。样本使用虚拟计时器和
合成房间状态，没有测试真实网络丢包，也不证明 Streams 的所有实现细节。
既有两种恢复信号、抖动感知退避及健康房间扫描均保留。
