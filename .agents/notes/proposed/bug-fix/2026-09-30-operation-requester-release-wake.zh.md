# requester Turn 释放时唤醒 Operation completion

Status: proposed
Translation: current

[English](2026-09-30-operation-requester-release-wake.md)

## 摘要

pending Operation completion 可能在 requester Turn 结束后一直等待，因为文档通知发生时 execution 仍持有该 Turn（#1170）。本方案为每个 requester 注册一个绑定准确 Turn 的释放 barrier，真正释放执行归属后再唤醒 coordinator。pending user dispatch 仍优先，coordinator stop 会令旧 callback 失效。复用已有无竞态的 execution barrier，不加入轮询 timer 或额外历史扫描。

## 决策与证据

`deliverIfRunnable` 正确拒绝 busy requester，但未持有稍后的 wake。`SessionExecutionService.waitForTurnRelease` 注册 waiter 后重查归属，因此观察与注册之间发生释放也安全。同一 Turn 的重复 hint 合并；新 Turn 替换 callback token。stop 清除 token，避免稍后的 callback 打开 store 或 dispatch，包括同一 coordinator stop/restart。

```text
pending Delivery + active requester Turn -> 注册准确释放 barrier -> 返回
execution 释放 Turn -> 验证 callback 归属 -> 重查当前持久化状态
pending user dispatch -> 延后 Delivery；否则走既有 fenced Delivery 路径
```

保留既有 completion 协议与用户优先保证。独立的 provider 前 settlement 缺陷（#1171）不包含在本改动。简化 Operation model 在 busy 时持有 release wake，并探索释放后的转移。coordinator 套件通过（80 个测试），可执行 model 通过（17 个测试），覆盖仅 release 触发的 wake、用户优先与 stop 失效。根目录格式和文档检查通过；根目录 `pnpm check` 因 Devin adapter 未安装 Node/core 依赖而在构建阶段停止，后续根目录检查未运行。不声称上游批准或真实 provider/桌面复现。
