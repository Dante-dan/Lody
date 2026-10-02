# 凭据 helper 诊断使用当前运行时

Status: proposed
Translation: current

[English](2026-10-03-credential-helper-probe-runtime.md)

## 摘要

Git 认证失败诊断通过 PATH 中的 `node` 可执行文件启动凭据 helper。
桌面内嵌 daemon 已能执行 JavaScript，但继承的 PATH 可能没有 Node 安装，
使诊断探测在检查凭据前就失败。改用 `process.execPath`，并保留现有子进程环境，
包括 `ELECTRON_RUN_AS_NODE`。本提案只修复诊断路径，不消除用户脚本的 Node
依赖，也不改变 agent 运行时选择。

## 决策与范围

[问题报告](https://github.com/LodyAI/Lody/issues/1186)涉及桌面启动执行中的 Node
查找。`WorktreeManager.runCredentialHelperProbe` 执行 Lody 自有的 JavaScript
helper，应使用已经执行 daemon 的运行时。原有冻结 broker/context 环境和凭据
协议保持不变。另一条路径是继续通过 PATH 找其他 Node，但会重复失败的查找，
还可能选中不同运行时。

现有 [Electron 子进程契约](../../../../apps/electron/AGENTS.md#embedded-cli-and-native-dependencies)
要求继承 `ELECTRON_RUN_AS_NODE`；探测已完整传递准备好的环境。本提案不新增
环境过滤、凭据路由或 Spec 意图。[broker 路由测试](../../../../apps/cli/src/session/worktree/worktree-manager-broker-auth.test.ts)
仍是该行为的归属测试套件。

[个人凭据回退决策](../../implemented/bug-fix/2026-09-30-github-personal-identity-silent-fallback.zh.md)
负责凭据选择。本提案仅改变诊断 helper 的启动方式，不替代该决策。

## 验证

回归测试使 Git fetch 失败并令 PATH 中没有 Node，然后通过确定性的本地 broker
fixture，让生成的 helper 作为真实子进程执行，检查成功的凭据诊断结果和冻结的
请求者归属。它不声称验证了打包 Electron 启动，也不声称修复了 issue 所描述的
全部 Node 依赖。
