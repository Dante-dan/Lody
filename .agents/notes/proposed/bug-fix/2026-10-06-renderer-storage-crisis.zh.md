# 渲染进程 Repo 存储危机边界

Status: proposed
Translation: current

[English](2026-10-06-renderer-storage-crisis.md)

## 摘要

渲染进程 IndexedDB 连接失败后，即使释放磁盘空间，会话创建仍可能反复失败。
当前库已分类错误，但应用没有 Repo 危机状态的所属责任。本提案将存储观察、
修改前拦截和用户发起的关闭分开；仅包装存储不能承诺整个应用失败后停止
写入。首次范围不含文件系统清理和跨渲染进程原子性。本记录仅依据源码调查
与文档验证，尚未实施或测试所提行为。

## 已调查证据

针对 [#417](https://github.com/LodyAI/Lody/issues/417)，检查 main
`86e0da5ee125d911d097210dda6ac4d382230c1a`。作者的
[升级结论](https://github.com/LodyAI/Lody/issues/417#issuecomment-5855033825)
说明 loro-repo 0.20.3 已分类同步 transaction 失败，将重连交给应用，并可能
把升级失败报告为 `unknown`。不再恢复已经过时的本地库错误分类补丁方案。

`create-workspace-runtime.ts` 在 Repo 边界直接组合 `IndexedDBStorageAdaptor`，
并传给 `createSessionSnapshotLoader`。当前公开源码中未找到应用级
`RepoStorageError` 或存储危机处理。快照加载器捕获种子 save 失败后返回已
持久化状态，因此危机观察必须位于该 catch 下层。当前 `startSession` 在获取
和写会话前先写 metadata，Flock 操作会修改实时 handle。只拦聊天 toast 或
`startSession` 会遗漏其他写路径；只拦持久化可能留下看似已接受的内存编辑。

游标存储的降级内存回退服务于可重建检查点，不是 Repo 真实数据。现有崩溃
恢复处理渲染/进程失败，不处理异步存储错误。Electron 退出保留未保存文档
的 veto 和 CLI 所属责任；强制退出会违反现有边界。

## 决策与备选

提议由 runtime 持有不可自动解除的危机，适配器边界观察并拒绝后续调用，
修改前 guard 拦截实时文档，恢复界面位于工作区初始化之外。使用明确的
quota/unavailable 类型，对未知错误保持未知。保留用户发起的正常退出，不
承诺在途操作回滚。意图及验证条件由
[draft Spec](../../../../specs/renderer-storage-crisis.zh.md) 承载。

不采用聊天 toast 单点修复：它让 archive、Flock 与后台写入继续。不采用
内存 Repo 回退：它掩盖持久化丢失。不增加自动重连：作者要求明确退出并
重新启动，当前源码不能证明新连接会保留失败 runtime 的状态。

## 验证与剩余工作

源码追踪是静态证据，不是实机磁盘耗尽复现。需要在所属测试中实施并验证
拦截与恢复界面，才可声称修复。保留启动种子 save 失败信号，拒绝新的实时
修改，并沿正常退出路径验证留在应用/离开。draft Spec 不代表已获得对应
人工批准；当前根目录/Spec 规则未禁止批准前实施。fork PR 发布另需有效的
关联 issue 和用户对公开 Context handoff 的真实选择。

## 参考实现检查点

参考分支已接入 typed sticky crisis、完整 StorageAdapter 方法及 replica 游标
包装，并在 WorkspaceWriter 获取前和 await 后检查修改边界。所属
`workspace-writer.test.ts` 14 项通过，包含明确的 quota/unavailable、等待获取
期间失败和 unknown 不误分类。尚缺阻塞界面、用户退出动作与后台活动停止，
不代表已经实现整个 Spec，也不代表跨窗口或在途写入回滚。
