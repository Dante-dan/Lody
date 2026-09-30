# Operation completion 在 provider 前中止

Status: proposed
Translation: current

[English](2026-09-30-operation-pre-provider-halt.md)

## 摘要

Operation completion 在内存压力中止后可能被记为 handled，尽管 agent prompt 从未启动（#1171）。本方案将 delivery 在 provider 前的已知中止报告为 `not_started`，保留现有 claim 释放和有界重试路径。普通用户 Turn 仍保持既有失败确认语义。provider 已经启动后不因此获得重放权限。

## 决策与证据

`SessionExecutionService.runVisibleSessionTurn` 过去将所有已知中止报告为 `handled`，coordinator 随即消费该结果。持久化 system Turn 不等于 agent 已收到输入。使用 `runtime.promptStarted` 和 delivery dispatch source 区分确认的 provider 前失败；在既有内存压力测试中覆盖两种 dispatch。

另一个 requester idle 唤醒问题（#1170）仍需通过现有 `waitForTurnRelease` barrier 绑定释放后的唤醒，并补齐所属测试的确定性覆盖。本改动不包含该调度路径。

## 验证边界

首次定向测试因 Devin adapter submodule 缺失无法收集。初始化声明的 submodule 后，3 个定向内存压力测试通过。完整所属套件和仓库检查仍需记录。格式和 docs check 通过，不声称上游批准。
