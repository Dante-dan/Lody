# 在 renderer 有界重连期间保留存活状态

Status: proposed
Translation: current

[English](2026-10-04-renderer-presence-reconnect.md)

## 摘要

renderer 重连会清空已发布的机器 presence map，尽管 daemon 可能仍在运行。本参考修复在重连主动停止 presence 时保留最后快照，并等替换 room joined 后才发布其 store。心跳时间戳不变，既有 freshness 判断仍会让过期机器失效。真实 workspace 销毁仍清空 presence；尚未在真实 Windows 桌面上验证报告场景。

## 决策与证据

Issue [#480](https://github.com/LodyAI/Lody/issues/480) 指出 `WorkspacePresenceTransport.onBeforeStop` 无条件发布空快照。renderer 两处重连分支停止并重启 presence；现改为显式保留已发布快照。销毁和 cloud-plane detach 保持默认清空行为。

替换 store 在 bootstrap 前为空，本地 viewing 写入也可能发生在这个区间。因此要等替换 room joined 再发布，包括 watchdog 再次启动，而不只是移除 stop 回调。销毁时删除本地 viewing key 不是远端快照，不发布。joined 后机器集合为空则再次具有权威性。既有时间戳 TTL 仍为存活边界，不刷新旧心跳，不增加订阅。

若所有 stop 都保留快照，会在 runtime 销毁后留下数据；显式重连选项避免这个生命周期泄漏。本修复落实 [presence Spec](../../../../specs/loro-ephemeral-presence-channel.zh.md) 既有 unsynced 表示 unknown 的意图，不修改保证。

## 验证及限制

扩展所属 presence transport 测试，涵盖心跳保留、本地 viewing 写入、bootstrap 前多次重启、旧代 joined 事件、替换 joined 和最终销毁。执行仓库检查并在贡献交接里如实记录结果。不宣称真实 Windows 复现、人工批准或已创建 PR。
