# 远程 daemon 生命周期确认

Status: draft
Translation: current

[English](machine-lifecycle-ack.md)

## 已接受操作与响应传递

CLI 接受的已授权重启或升级，即使确认响应无法送达也必须继续执行。接受升级仍要求先成功写入升级 intent。被拒绝的操作不得触发生命周期退出。

RPC 服务先尝试传递接受响应，总预算为五秒。成功、重试耗尽或期限到达后调用原有 CLI 生命周期回调。ACK 传递错误只用于诊断，不得再给出矛盾的操作失败响应。迟到的完成不得再次调用回调。

进程边界继续保留一次性退出保护；此契约不增加进程内准备序列化或重启请求去重。期限限制等待，并不取消底层 HTTP 请求。客户端超时只表示结果未确认，不会取消已接受工作，也不能证明 daemon 没有重启或升级。完成状态展示是独立工作。

## 升级请求重投

授权核验后，若明确目标版本等于当前 CLI 版本，返回成功响应且不接受另一次进程退出。Worker 不知道 `latest` 的解析版本，因此不能用此比较跳过它。

Worker 在接受升级前，将请求者和请求 ID 写入安装配置的数据目录。安装器在启动 npm 前把该记录标为已尝试；准备记录允许安装器执行一次，重投请求不得再授权进程退出。尝试记录跨 Worker 和 watchdog 重启保留 25 小时，覆盖 Machine RPC stream 的 24 小时保留期。中断或失败安装也算一次尝试。目标仍未运行时，同一请求重投（包括 `latest`）返回错误，提示检查 daemon 路径、npm prefix 并用新请求明确重试。拒绝重投不安排另一次生命周期退出。读取或写入记录失败会阻止准备或安装，不会绕过重投保护继续安装。

标准 npm 全局安装从实际 daemon 入口的真实路径推导 prefix，避免使用不同的环境 npm prefix；其他布局保留 npm 既有选择。npm 成功后，对同一入口执行有时限的 `--version` 探测，明确版本目标只有完全匹配才允许 watchdog 交接。无效、失败或不匹配的探测报告可操作的安装路径错误，保留尝试记录阻止同请求再安装。`latest` 只验证入口返回版本，不能确定尚未解析的 registry 目标。

这验证交接前的入口，不是新 Worker 的实际运行版本；不解析 `latest`、修复自定义/npx 安装布局，也不保证保留期外永久恰好执行一次。记录期限由本机时钟控制；新请求 ID 可以重试失败尝试。上述预期行为仍是需要人工评审的草案。

## 实现证据

- [RPC 确认](../packages/loro-streams-rpc/src/machine-rpc-server.ts)
- [CLI 回调](../apps/cli/src/lib/message-handler.ts)
- [进程退出边界](../apps/cli/src/commands/start.ts)
- [模拟传输测试](../packages/loro-streams-rpc/tests/machine-rpc-server.test.ts)
- [升级尝试和安装器](../apps/cli/src/lib/machine-lifecycle.ts)
- [安装器重投回归](../apps/cli/src/lib/machine-lifecycle-upgrade.test.ts)
