# 保留进行中的 Streams 元数据房间加入过程

Status: implemented
Translation: current

[English](2026-09-30-meta-room-join-recovery.md)

## 摘要

Streams 元数据房间仍在重连、聚合传输状态却为已连接时，CLI 看门狗会调用 `repo.reconnect()`。Streams 适配器会把 `reconnecting` 房间视为可再次加入，因此该调用可能在房间完成加入前重新启动它。现在恢复控制器让房间自身的重试循环完成该过程；传输断开或房间明确失败时仍走原有恢复路径。若房间永久停在 `reconnecting`，恢复仍依赖适配器的重试行为，尚待真实网络环境确认。

## 证据与决定

[Issue #399](https://github.com/LodyAI/Lody/issues/399) 报告网络降质时每分钟发生 3–11 次传输重连，而元数据房间加入约需 900 毫秒。当前 `connection-recovery.ts` 把所有不健康的元数据状态都当作调用 `repo.reconnect()` 的理由。已安装的 `loro-repo` 0.21.1 中，`StreamsTransportAdapter.reconnect()` 对处于 `reconnecting` 的元数据会调用 `stream.rejoin()`，适配器连接状态则聚合所有已加入的房间。因此，聚合传输状态为已连接且元数据仍在重连，表示房间加入正在进行，不能证明传输需要重启。

当聚合传输未断开且元数据房间为 `connecting` 或 `reconnecting` 时，控制器跳过自动重连，也不会把跳过计入传输退避。强制重连、传输断开及元数据 `disconnected`/`error` 均保留原有路径。这里不添加第二套房间调度器：适配器已负责房间重试，两套调度可能不断互相打断。此前未合并的 [PR #478](https://github.com/LodyAI/Lody/pull/478) 也识别了同一边界；它因贡献政策计时到期而关闭，不代表修复已合并。

## 验证与限制

控制器测试覆盖进行中的加入跨过看门狗执行和随后退避窗口，并检查房间加入后健康状态恢复。另一项测试确认元数据 `disconnected` 仍能触发恢复。这些测试使用假时钟与假仓库，没有运行真实降质 Streams 会话。如果适配器永远不离开 `reconnecting`，控制器在聚合传输仍连接时不会强制传输重连；若现场证据表明适配器重试循环会卡住，房间级超时应由适配器负责。
