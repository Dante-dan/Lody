# 限制 daemon 重启后的远程升级重投

Status: proposed
Translation: current

[English](2026-09-30-daemon-upgrade-replay.md)

## 摘要

[Issue #1178](https://github.com/LodyAI/Lody/issues/1178) 报告两台 Linux daemon 重复接受同一升级请求，其中一台已经运行目标版本。提议的修改让已授权且目标版本已运行的请求直接完成，不再退出；npm 启动前记录安装尝试，跨重启保留 25 小时。目标仍未达到的重投返回可操作错误，要求用新请求明确重试。此方案限制重复安装，使标准 npm 全局安装采用 daemon 入口所在 prefix，并在交接前验证入口；不证明新 Worker 的运行版本或请求重投的未知根因。

## 证据与范围

Issue 提供实际事故日志，并非干净环境复现。现有 `pendingProcessLifecycleAction` 只在 Worker 内存中，安装 intent 在每次尝试后删除，二者均不能跨重启提供重投证据。Machine RPC stream 保留期为 24 小时。[原 ACK 决策](../../implemented/bug-fix/2026-09-08-machine-lifecycle-ack.zh.md) 明确排除跨重启去重；本方案增加升级专用保护，保留 ACK 和重启行为。[Spec](../../../../specs/machine-lifecycle-ack.zh.md) 仍为草案。

[PR #1069](https://github.com/LodyAI/Lody/pull/1069) 将安装器迁移到统一进程树接口，但不修改重投完成或 intent 清理；本方案不重复其执行重构。

## 决策与限制

`getLodyDataDir()` 下的 JSON 记录保存请求 ID、请求者、目标和本机尝试时间，并在接受升级前写入。安装器在启动 npm 前将准备记录改为已尝试；记录写入失败因此会在 Worker 仍在线时阻止准入。不保存请求 token 或日志，采用私有文件权限及原子 rename；追加尝试时清理过期条目。读取、解析或写入失败不允许绕过保护安装。失败或中断仍阻止同请求自动重试。明确目标已运行时返回成功且 `accepted=false`，保持生命周期回调不触发。`latest` 的解析目标未知，因此重投返回错误，不虚称成功。

只用内存无法保护新 Worker；仅清理或保留临时 intent 不能区分待执行安装和已尝试操作。永久记录会持续增长；25 小时覆盖 24 小时 RPC 保留期并留一小时余量。本机时钟变化及保留期外请求是限制，并非永久恰好一次保证。下文后续处理标准 npm prefix 选择和交接前入口验证；自定义/npx 布局、交接后 Worker 版本和 `latest` 解析仍待独立判断。PR 应引用而非关闭 #1178。

## 验证

扩展原有安装器测试，跨模块重载检查真实文件记录，覆盖 npm shim 成功与失败、目标已运行、`latest` 重投拒绝、新请求明确重试及过期。未运行原 Linux host、真实全局 npm 安装、cloud RPC 或 watchdog 重启；生命周期 13 项测试通过（原有 npm shim，冷启动模块导入钩子明确预算 60 秒，保留原有测试超时和行为断言）。完整并发套件中的默认 10 秒 setup hook 在导入生命周期依赖图时超时，这是 setup 时间失败，不代表安装器行为断言失败。`pnpm format` 与 `pnpm run docs check` 通过，后者仍有已有警告。对齐当前提交的 ACP 子模块并按 frozen lockfile 重装依赖后，CLI 类型检查通过；此前缺失 Devin manifests 和 MCP client 类型源于复用 checkout 的旧依赖。已启动完整 `pnpm check`，其最终结果单独记录。

## 后续：安装入口验证

源码显示 npm 成功被当作升级成功，但 watchdog 交接仍重用旧入口。后续实现只为标准 npm 全局入口布局推导明确 prefix；安装后对实际入口执行 `--version`，明确目标只有匹配才允许交接。自定义/npx 布局保留 npm 既有选择，明确目标不匹配时安全失败。这是交接前入口检查，不证明 ready 后新 Worker 的版本；`latest` 仍未解析。原有测试套件用合成 npm/CLI 覆盖入口旧版本和环境 prefix 错配，未执行真实全局安装或原始 Linux 主机验证。
