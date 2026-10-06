# 渲染进程存储危机

Status: draft
Translation: current

[English](renderer-storage-crisis.md)

## 场景

Chromium 配额耗尽或 IndexedDB 连接正在关闭时，本地工作区无法持久化渲染
进程的 Repo。释放文件系统空间不会让当前连接恢复健康。连续创建会话不应
反复显示数据库原始错误，也不能让用户以为未持久化的写入已成功。

这是 [#417](https://github.com/LodyAI/Lody/issues/417) 的拟议意图，尚未获得
批准，也不是已实现的恢复流程。

## 职责

工作区 runtime 为自己的 Repo 持有不可自动解除的危机状态。在存储适配器
边界观察失败，包括启动与后台持久化，而不只在聊天提交的 catch 中处理。
带类型的 `quota` 或 `unavailable` 错误进入危机；单独的 `unknown` 不足以
判定磁盘耗尽。保留第一个原因和可公开的诊断信息。独立 Streams 游标存储的
内存回退不适用于承载真实数据的 Repo。

进入危机后，在调用已损坏的适配器前拒绝新存储操作。同时在改变实时文档前
拦截应用 mutation：只拒绝后续 save 不能让先前成功的内存修改变成持久化
数据。取消新的 runtime 获取、依赖持久化的 transport/重连工作与排队写入。
在途操作可能已经改变内存或部分落盘；不能暗示回滚，也不能重放结果不明的发送。

恢复界面位于受影响的工作区子树之外，使初始化失败和使用期间的失败都能
展示它。界面阻止继续编辑和发送，使用本地化文案解释必须重启，而非直接贴
异常消息。Electron 提供明确的退出按钮。不自动重载、重置存储、重连适配器，
也不创建内存 Repo。

退出沿用 Electron 的正常关闭流程，保留其他未保存编辑器的留在应用/离开
确认以及所属 CLI 的关闭责任。取消退出后危机仍有效，不恢复写入。重新启动
由用户另行执行。不得以 Repo flush 或删除数据库作为退出危机的前置步骤。

## 首次交付与边界

首次交付覆盖渲染进程 Repo 的失败检测、不可自动解除的 mutation/存储拦截、
阻塞恢复界面和用户发起的正常退出。文件系统存储管理延后，需要独立审核的
删除白名单，且不得操作 IndexedDB 或调用 Repo 的 archive/purge API。
CLI ENOSPC 仍由 [#1054](https://github.com/LodyAI/Lody/issues/1054) 处理。

其他独立渲染进程可能使用不同缓存命名空间。本提案不承诺跨窗口原子停止
写入、持久化回滚、找回未落盘编辑或修复运行中的 Chromium 连接。这些需要
另外明确契约，不能靠全局崩溃处理器暗中承诺。

## 实施所需验证

扩展所属仓库测试，以确定性注入 `quota` 和 `unavailable`：awaited load、
后台 save 与启动失败都进入危机；之后 mutation/存储操作应拒绝且不改变文档
状态；`unknown` 不冒充配额错误。覆盖快照种子 save 失败，因为现有 catch
可能吞掉这一错误。

验证真实恢复界面与现有 Electron 退出责任：选择留下保留危机，选择离开
退出且不重置/删除 Repo 存储。明确错误注入不是磁盘耗尽实机复现。检查通过
与 draft 元数据都不是人工批准。

## 证据

- [Runtime 存储组合](../packages/components/src/providers/create-workspace-runtime.ts)
- [Writer 修改边界](../packages/components/src/providers/workspace-writer-impl.ts)
- [快照加载器](../packages/components/src/providers/local-window-bootstrap.ts)
- [既有崩溃恢复意图](renderer-fatal-recovery.zh.md)
- [退出责任规则](../apps/electron/src/main/services/AGENTS.md)
- [拟议调查记录](../.agents/notes/proposed/bug-fix/2026-10-06-renderer-storage-crisis.zh.md)
