# 为 ACP 命令退出后的输出排空设置上限

Status: proposed
Translation: current

[English](2026-10-06-acp-terminal-exit-drain.md)

## 摘要

Shell 命令退出后，后台子进程仍可能持有 stdout 或 stderr。只等待 Node 的
`close` 事件，会让 ACP terminal 等待持续到后台进程结束。这里提议记录 `exit`，
在 `close` 或 100 毫秒排空期限先到时报告一次原命令状态。普通尾部输出仍可保留，
但不等待后台作业完整输出，也不终止这些作业。

## 证据与职责

[Issue #1270](https://github.com/LodyAI/Lody/issues/1270) 报告 `sleep 30 &`
约 6 毫秒退出，而 terminal 等待持续 30 秒。这是报告者的证据，不是本次测量。
[ACP terminal 合约](https://agentclientprotocol.com/protocol/v1/terminals#waiting-for-exit)
要求在命令退出时响应。`SessionProcessHandle` 已缓冲并回放两个生命周期事件，
因此修复应在 `ShellTerminalManager`，不改变共享 sandbox 的进程生命周期和终止逻辑。
它补充了[未拆分命令修复](../../implemented/bug-fix/2026-09-12-acp-terminal-unsplit-command-line.zh.md)，
不改变启动错误处理。

## 决策与取舍

`exit` 启动排空期限，`close` 可提前结束等待。一次性标记保留命令退出码和信号，
并只执行一次资源限制检查。释放 terminal 时取消两类事件订阅并清除计时器，
输出监听和有上限的缓冲区保留到释放。

直接在 `exit` 报告可能遗漏正在传输的输出；无限等待 `close` 会重现挂起。
100 毫秒期限是调度余量，不保证完整收集后台作业输出。资源限制检查保留原有异步行为，
仍可能独立于输出排空延迟报告。

## 验证

现有 terminal 测试套件新增确定性事件和假计时器覆盖：无 close 的 exit、排空期间
尾部输出、期限前的 close，以及迟到 close 不覆盖退出状态。已有真实进程测试覆盖
普通输出和启动失败，没有新增依赖真实休眠的竞争测试。具体检查结果随参考提交说明。
尚未在真实 agent 上复现报告者后台服务器场景，也未验证 Linux 资源限制 sandbox。
