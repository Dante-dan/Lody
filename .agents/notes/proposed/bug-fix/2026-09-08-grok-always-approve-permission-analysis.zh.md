# Grok Always Approve 仍显示权限请求的源码分析

Status: proposed
Translation: pending

## 摘要

当前 Lody 已实现 Grok 启动时的 YOLO 元数据转换，以及官方客户端对残留权限请求的
单次自动批准；不能再把弹窗笼统归因于缺少这两项实现。源码中仍存在两条可解释现象的
路径：聊天选择器只修改未发送配置，当前回合不会立即切换权限；自动批准流程分两次
写历史，使前端能够观察到尚未批准的中间状态。建议分别明确并实现活动会话的权限切换
语义，以及让自动批准请求和结果原子发布。本文是分析与修复提案，没有修改运行时代码，
也尚未用报告问题的具体会话确认是哪一条路径触发。

## 范围与版本

- Lody：`21bd38123f7938e600b2fe135af09917061ea2df`。
- 固定的 Grok 扩展：`77a994f4e0a5acec8c52020c0a8e01b0e90aaef9`，
  [runtime-manifest.json](../../../../packages/acp-extension-grok/runtime-manifest.json)
  指定官方运行时 `1.0.13`。
- Core：`7bc6332d3f007876895b4a3a827be0060f4d5318`。
- 2026-09-08 拉取的公开
  [grok-build](https://github.com/xai-org/grok-build/tree/72a61251fcffb464bcc687aeb5a998e5a98ec0c9)
  HEAD 为 `72a61251fcffb464bcc687aeb5a998e5a98ec0c9`，提交日期 2026-09-01；
  `SOURCE_REV` 为 `a549186d9d39311f2d3ee4208db62af8c65aa476`。

公开仓库是官方内部仓库的定期同步，不能据此宣称它和发行二进制 `1.0.13` 完全相同。
此次没有发起真实模型回合，没有读取或保存用户会话记录，也没有修改 Grok 配置。

## 已有实现与官方语义

### 会话建立和运行中切换是不同入口

[AgentClient](../../../../apps/cli/src/agent/agent-client.ts) 的
`getSessionStartMeta` 把该回合的 `configOptionValues` 放入
`_meta.lody.sessionConfig`，builtin Grok 另带 `clientIdentifier=lody:<sessionId>`。
初始化和 new/load/resume/fork/replacement 路径传递相应元数据。

[proxy.js](../../../../packages/acp-extension-grok/src/proxy.js) 的
`translateSessionStart` 在转发建会话请求之前，把 `permission_mode=always-approve`
转换为 `_meta.yoloMode=true`。官方
[session_setup.rs](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-shell/src/agent/mvp_agent/session_setup.rs#L324)
确实读取这个字段，不能把 camelCase 的启动字段与 snake_case 的通知字段混为一谈。

运行中的 `session/set_config_option` 则转换为 `_x.ai/yolo_mode_changed`：

```json
{
  "clientIdentifier": "lody:synthetic-session",
  "permission_mode": "always-approve",
  "yolo_mode": true,
  "auto_mode": false
}
```

官方
[acp_agent.rs](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs#L2662)
按 `origin_client.product/clientIdentifier` 找到驻留会话，发送 `SetYoloMode`；
[run_loop.rs](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-shell/src/session/acp_session_impl/run_loop.rs#L1146)
再更新权限管理器。通知不是有确认响应的请求，不能为尚不存在的会话建立启动默认值。

扩展的 setter 会立即更新自己的 `permissionModes` 并返回 configOptions；因此该响应
证明扩展接受了选择，不能证明官方运行时已执行或接受它。其 configOptions 中的权限
值来自扩展自己的 Map，不是读取官方权限管理器的结果。

### YOLO 仍可能产生 ACP 权限请求

官方
[权限管理器](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs#L1721)
的快速批准条件是 `yolo_mode && !shell_forced_prompt && !hook_forced_prompt`。
shell/file 检查和 Hook 强制询问可以让请求进入交互路径；明确的策略 deny 在 YOLO
之前就拒绝，不会靠客户端批准恢复。受管理策略还可以禁止启用 YOLO。

官方 TUI 在
[permissions.rs](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-pager/src/app/acp_handler/permissions.rs#L25)
另做一层处理：所属会话是 YOLO 且提供 `AllowOnce` 时立即返回该选项，不入交互队列。
启用 YOLO 时，
[modes.rs](https://github.com/xai-org/grok-build/blob/72a61251fcffb464bcc687aeb5a998e5a98ec0c9/crates/codegen/xai-grok-pager/src/app/dispatch/modes.rs#L282)
也会清空已有队列，有 AllowOnce 则单次批准，没有则取消，绝不自动创建永久授权。

Lody 的 `827cf22e`（[PR #148](https://github.com/LodyAI/Lody/pull/148)）已加入对应
客户端行为，当前工作树包含它。规则在
[lody-acp-extension.ts](../../../../apps/cli/src/agent/lody-acp-extension.ts)，
历史持久化与等待请求收尾由
[MessageHandler](../../../../apps/cli/src/lib/message-handler.ts) 负责；扩展本身原样转发
`session/request_permission`。这与
[现有说明](../../../../apps/cli/src/agent/README.md#grok-permission-handling)
一致。残留 ACP 请求本身不能证明 YOLO 没生效，也不能证明 #148 不存在。

## 发现一：输入框的选择不是活动会话的权限切换

[session-chat-interface.tsx](../../../../packages/components/src/components/sessions/session-chat-interface.tsx)
直接把 `useAcpSessionConfigSelectionState().selectConfigOption` 作为权限选择回调。
[该 hook](../../../../packages/components/src/hooks/use-acp-session-config-selection.ts)
只调用 React `setFence`，更新 `edits.configOptions`，没有向 Machine 发出实时配置请求。

[配置推导](../../../../packages/components/src/lib/acp-session-config-selection.ts) 又让未发送
编辑优先于 runtimePreferences。因此以下状态是当前代码允许的：

```text
当前回合：Ask → 正等待权限
用户在输入框选择：Always Approve
输入框显示：Always Approve（未发送编辑）
AgentClient 已接受配置：仍是 Ask
自动批准判断：不命中，原请求继续等待
```

选择会随 `buildSessionTurnInputConfig` 进入下一次提交或队列；
[session-execution-service.ts](../../../../apps/cli/src/session/session-execution-service.ts)
在执行回合时调用 `applyAcpModeAndModel`，最后才由
[配置应用器](../../../../apps/cli/src/session/acp-session-config-applier.ts)
调用 `setSessionConfigOption`。仅排入下一回合也不会解开当前等待请求。

这条路径能解释“弹窗后切到 Always Approve，仍一直等批准”；如果在发送当前回合之前
就已经选择 Always Approve，则需要继续查该回合的实际配置，不能直接归入这个原因。
客户端的配置订阅和队列清理机制存在，但输入框点击不会触发它。

[现有 run-config 说明](../../../docs/sessions-run-config.md) 明确将未发送选择作为私有
草稿，提交后才进入执行配置。因此这不是已承诺的实时 setter 发生故障，而是当前交互
语义无法满足“切换后立即放行”的预期；把权限选择改成即时操作属于需要明确的新语义。

## 发现二：自动批准前会暴露待批准历史

`MessageHandler.handleAgentPermissionRequest` 当前顺序为：

1. `ensurePermissionRequestOnToolCall` 写入没有 outcome 的 permissionRequest。
2. 等待 `setLastMessageAt`、`getMetaState`、`getHistory`。
3. 用 AgentClient 已接受配置计算 automaticOutcome。
4. 再用 `updatePermissionOutcomeInHistory` 单独写入自动批准结果。

[history.ts](../../../../apps/cli/src/lib/acp/history.ts) 的两个操作各自执行一次
`doc.updateHistory`，中间没有原子发布边界。
[FloatingPermissionRequest](../../../../packages/components/src/components/sessions/floating-permission-request.tsx)
只要 session 状态是 running 或 requestPermission，并且历史中有尚无 outcome 的请求，
就会显示权限 UI。它不要求后台已经设置 requestPermission 状态。

因此，“自动批准分支没有调用 setStatus(requestPermission)”不足以证明前端不会弹窗。
前端若观察到第一次写入，会显示请求，第二次写入后消失。隔离探针验证了两个历史状态的
可见性判断；尚未测量真实 Flock 同步是否在某次运行中合并了两次更新，不能宣称每次
自动批准都必然闪烁。若第二次历史写入失败，后台返回 cancelled，但第一条未解决历史
可能残留；这是相关错误路径，需要修复时一并验证。

## 其余命中条件与定位边界

自动批准要求同时满足：builtin Grok、已接受的 `permission_mode` 为精确值
`always-approve`、普通工具权限请求、包含 `kind=allow_once` 的选项。

- custom/registry 启动同一个扩展，不会自动获得 builtin Grok 的客户端规则；
  builtin 专用 clientIdentifier 注入也不适用于它们。
- Auto 和 Always Approve 是不同值；Auto 仍可以询问。
- 用户问题保持交互，不能为了“全批准”自动选择问题答案。
- 没有 allow_once 的新请求保持交互，这是当前有意的兼容行为；官方普通权限选项
  构造通常包含 AllowOnce，尚无证据表明报告问题的请求缺少它。
- 本文分析的是当前 checkout，不能证明用户实际运行的 daemon/打包扩展已包含 #148。
- 官方 managed policy 可钳制 YOLO，扩展却可能继续显示乐观值；这是有效状态可观测性
  的限制，不能直接认定为本次弹窗根因。不要用全局永久授权去消除这种差异。

对于“发起回合前已选 Always Approve，普通工具仍永久等待”的复现，下一步应只核对
客户端/扩展/运行时版本、Provider cliType、该回合请求配置、AgentClient 已接受配置、
请求是否为问题、选项 kind，以及自动批准结果是否持久化。无需收集 prompt、命令正文、
凭据或完整用户记录。

## 修复提案与取舍

1. 若产品要求点击权限模式立即作用于活动会话，需增加明确的运行中配置更新入口，
   在当前执行会话上调用 setter，接受后更新 runtime snapshot 并由已有持久权限流
   清理队列。明确失败、并发回合、会话归属及运行中切换的语义后再更新 Spec 为 draft；
   不应把所有输入框配置编辑都默认变成实时 RPC。
2. 如果保持“下一回合配置”的语义，UI 应明确标出未发送选择，避免看起来像当前权限
   已经改变。这能消除状态误解，但不会提供立即放行能力。
3. 在持久权限流中预先判断可自动批准的请求，把请求与已选 outcome 放进同一次历史
   更新，成功持久化后才回复 ACP；保留审计记录、问题交互及显式用户拒绝优先规则。
   不建议用前端按权限模式隐藏所有弹窗，也不建议在扩展中抢答而绕过 Lody 持久化。
4. 若未来完善官方有效权限状态同步，应以官方确认/事件为依据；单纯再发一次 YOLO
   通知不能解决输入框未派发或中间历史可见问题。

这些是待实现提案；本次没有改变产品意图、Spec 或权限边界。

## 验证

- 开始时 `pnpm run docs status`：无错误；存在原有翻译债务和 AGENTS 大小警告。
- 用全局 TypeScript 编译当前 Core 到临时目录；在临时副本中运行扩展的现有测试：
  33/33 通过。测试验证转换、状态和透传，不代表官方二进制端到端批准验证。
- 从实际源码提取并去除类型后运行确定性探针：验证 builtin allow_once 自动回应、
  未发送 UI 值覆盖 runtime Ask、两个历史状态分别显示/隐藏权限 UI，以及 custom 和
  缺少 allow_once 的分支。只使用合成普通权限请求；没有测试问题解析或 React/网络。
- 当前工作树没有 node_modules，未运行 Lody 完整 Vitest、应用构建或真实模型回合。
  原有 `message-handler-grok-permissions.test.ts` 主要断言最终结果、状态和订阅，
  没有覆盖上述输入框入口与中间历史在前端的可见性。
- `pnpm run docs check` 与 `git diff --check` 通过；文档检查保留原有大小警告。

没有创建 PR，没有修改运行时代码。英文翻译待补。
