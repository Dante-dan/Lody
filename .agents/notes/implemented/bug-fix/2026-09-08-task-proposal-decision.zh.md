# 处理任务提案时不再写回旧历史

Status: implemented
Translation: current

[English](2026-09-08-task-proposal-decision.md)

## 摘要

原来的任务提案处理先读取消息，再次获取 store 后整条写回，期间到达的 agent 更新
会被旧消息覆盖。现在由现有 WorkspaceWriter 获取一次 store，按 proposal id 找到
最新提案，仅通过 HistoryWriter 更新处理结果。本次修复已复现的丢更新，不改变
任务创建、持久化或同步的责任归属。

## 责任与证据

Hook 传递提案标识和 outcome/taskId，不再传递旧的整条历史。渲染时的 item 下标
不再用于选择写入目标。提案已不存在时不写入；非法结果仍由共享 writer 在写前拒绝。
不能在第二次获取 store 后继续覆盖整条旧消息，因为那样无法区分最新副本数据与旧快照。

原始双副本反例在 main 和 PR #460 均复现。永久 WorkspaceWriter 测试覆盖创建与忽略
两种结果，以及 store 获取前到达、离线并发的提案标题、正文和 read 更新。已经接收的
前置 item 插入验证按稳定 id 定位；同时验证目标缺失、非法结果和副本合并一致。
8 个 WorkspaceWriter 测试、全仓 `pnpm check`、修改代码的格式检查及文档检查通过。
首次沙箱内全仓检查遇到本地 socket EPERM，放开该限制后重跑通过。测试数据均为合成数据。

这不证明任意结构编辑都安全：额外探针同时在前面插入 item、离线改写提案时，
提案容器被重建，合并后丢失另一端的处理结果。本次没有修复这个更广的 HistoryWriter
item 对齐边界，也不宣称解决并发创建任务、磁盘崩溃恢复或已发布客户端端到端兼容。

本记录补充[单一写入入口决策](../architecture/2026-09-07-single-history-writer.md)。
PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
