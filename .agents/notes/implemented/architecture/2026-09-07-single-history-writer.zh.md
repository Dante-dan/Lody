# 窗口化读取之前，先统一历史写入

Status: implemented
Translation: current

[English](2026-09-07-single-history-writer.md)

## 摘要

关闭会话全状态校验恢复了发送，却也允许格式错误的新 item 进入文档。
PR #460 现从 #376 提取局部 writer/materializer 到 shared 包，前端与 CLI 都通过它写历史。
每条命令先解析新增轮次和变化的字段/item，不重新解析未改动的不兼容旧历史。
这是写入边界修复，不是窗口化 reader 上线，也不证明所有消费者都能安全理解未来数据。

## 责任与复用

提取前核对的远端 head：#376 `cc49d259`、#460 `15395c6c`。
按 schema 决定布局的 materializer 和最小字段 diff 来自 #376，没有新增另一种存储编码。
Writer 不再依赖 ConversationView。#376 后续 rebase 应导入共享 writer，删除本地 writer
及 Mirror 回退 writer；本 PR 不修改那个兄弟分支。

```text
前端 WorkspaceWriter ─┐
CLI / 带类型 callback ┼─ HistoryWriter → 最小 Loro 操作
                     │   ↑ 只解析新增/变化输入
Session Mirror 读取侧 ┘   不重新解析未改动旧历史
```

`createSessionMirror` 是共享适配层：已有 callback 只执行一次，其历史变化先完成检查，
再写控制字段。Mirror 仍读取完整文档，但不再写历史差量。CLI 的字段 setter 也进入 writer。
Operation progress 重复行按已有行身份合并，不再单独执行原始 Loro 别名写入。
移除 CLI 打开会话时清洗历史的操作：打开旧会话不应改写 notice 元数据，
也不应要求这些旧记录通过新输入解析器。

## 新输入与旧存储

补齐已有消息解析器遗漏的生产类型：子任务、评论/视觉引用、文本 spans，正常 ACP 权限/
位置字段，以及文件 transport 关联。Operation completion schema 从 CLI store 提到 shared，
由历史解析复用。`system_notice` 的 name/meta 改为关联的 TypeScript 联合类型。
正常历史写入 API 不再把 entry 擦成 `Record<string, unknown>`。

新轮次解析器及其派生类型没有替代所有旧读取类型。例如，已有图片读取类型接受任意 MIME
字符串，新输入解析会检查支持的 MIME 值。编译期测试覆盖错误消息、角色/状态字段类型、
name/meta 关联，以及消息类型是否都有解析器。

非法命令在修改历史前报告不含正文的路径/错误码，保留旧值；不会在同一条被拒命令内继续
写其他合法字段。闭合的新输入对象丢弃额外字段，明确开放的协议字典保留 JSON。
未改动旧 item 不重新解析，修改时保留已存储未知字段。本次未修复非历史控制字段校验。

## 兼容与后续工作

- 不迁移旧文档、不剔除图片、不外置附件、不修改 hash 格式。#443 与 #359 仍是后续独立工作。
- 字符串修改保留旧 Text/primitive 表示。提取的 materializer 保留 #443 可选存储提示支持；
  采用/回滚 schema hints 时仍必须与 Mirror patch 一起处理。
- Writer 没有功能开关；未来读取路径回退也必须使用同一个 writer。
- Callback 支持保持已有轮次顺序的修改，拒绝任意重排。导入/追加、删除、重复行清理、
  标量/文本修改保留已有轮次容器。
- 完整 Mirror 读取和旧 callback 仍可能有 O(total) 工作。尚未建立真实桌面、移动端和
  3000 轮验收结论。

## 证据

真实 Loro 测试覆盖未知/损坏历史、实时同步/快照重开、追加/流式更新、非法命令保留旧值、
控制字段写入前检查、扩展载荷仅含 JSON、并发收敛、容器 ID 和与 Mirror 新写入操作一致。
CLI/前端测试覆盖实际 writer 接入和重复 progress 行恢复。类型测试纳入正常 shared `tsgo`，
不是仅经 Vitest 转译。

验证：在允许监听 socket 的环境中，`pnpm check` 完整通过。首次沙箱执行在未改动的本地
IPC 测试中遇到 `listen EPERM`，这组测试在沙箱外单独重跑 9/9 通过。最终 focused shared
测试 77 项、前端发送/writer 测试 32 项、CLI 启动/dispatch 测试 5 项通过。改动文件格式、
类型检查和 `pnpm run docs check` 通过。这些是合成的本地测试，不是真实旧版本应用或桌面/
移动端端到端验收。

## 更正：fork notice 覆盖

对 `f0c55094` 的审查发现真实路径回归：TypeScript 允许已有的 `session_fork_origin`，
共享解析器却没有该 name。原有覆盖断言只检查 item `type`，漏掉了内层判别字段。
27 个 fork 测试 mock 了 `updateHistory`，因此两条真实 fork 路径失败时测试仍然通过。

本次补齐 fork-origin 关联的元数据 schema，不放宽未知新 notice name。编译期检查现在
双向比较 notice name 和完整关联类型。普通/worktree 两条服务回归使用真实 SessionDocument、
会话适配层和 Loro writer，修复前失败、修复后通过。Worktree 完成使用 fake immediate
与明确的 marker 清理信号等待。Writer 测试验证错误元数据不产生 CRDT 修改，并检查合法
notice 的写入回读。Provider 执行和磁盘持久化仍是 stub；这些测试证明本地写入边界，
不是 fork 持久性的端到端验收。

合入 main 时同时保留其 progress 无变化不写入的检查和共享 HistoryWriter 的写入职责。
没有引入旧历史迁移或全状态校验。
合入 `main@d366a5a6` 后，完整 `pnpm check` 和文档检查通过；fork/progress 专项测试
49 项、writer 测试 14 项通过。

## 更正：复制已存历史不是创建新输入

在 `cf0af8b4`，含未知 item 的历史可以继续追加消息，但 fork 仍会失败：目标为空，
复制来的每轮都被当成新消息。已知 item 的未知字段也会在目标中被静默裁掉。
编辑后重发回滚重新插入旧尾部时有同类问题。源文档并没有被重写。

同一个 HistoryWriter 现在直接从真实文档捕获进程内快照。私有 WeakMap 验证其来源，
公开的 history getter 返回独立副本，调用者修改它不能改变私有基线。`copyFrom` 对照
基线预检改动，再用既有 materializer 写入空目标：保留已存未知数据，解析新写字段、
item 和 notice。两种 fork 沿用原有持久化流程，传递冻结的源快照。
没有增加宽松解析开关、任意 trusted 数组构造器或第二个 writer。

`updateWithRollback` 捕获写入前后历史，返回一次性的本地回滚凭据。它不把旧值当新输入
重验，保留仍存活的轮次容器，并拒绝覆盖期间发生的历史修改。已删除轮次恢复时会获得
新容器。这不修复并发元数据回滚，也不提供崩溃恢复。外部 ACP 导入继续走严格的新输入路径。

真实 Loro 回归覆盖不透明复制、非法新增/修改不留下部分写入、伪造/修改快照、非空目标、
重开、源文档不变及远端修改使回滚失效。普通/worktree fork 和编辑后重发测试现在经过
真实 SessionDocument/适配层/writer，包含提交失败后的恢复。旧编辑测试的新图片输入
只有 `key`，缺少 `imageId`/`sizeBytes`；集成测试改用真实输入契约，保留不透明旧历史 fixture。
Provider/磁盘操作仍是 stub。若 fork 显式修改已损坏 item（例如附件元数据），该 item
仍需通过解析；这不是任意 reader 兼容。快照/复制仍处理完整历史，不是 3000 轮性能验收，
也不保证跨文档保留容器 ID。

本次更正验证：`pnpm check` 通过，包括 shared/CLI/components 类型检查与仓库全量测试。
专项覆盖为 writer 16 项、fork/编辑服务 35 项。这不证明真实 provider 执行、磁盘故障恢复，
或真实旧版本应用间的兼容性。

## 更正：初始化、已读确认和工具状态

对 `d3f91aad` 的审查发现测试遗漏了生产副作用。Worktree setup 会在 fork 复制之前
写入脚本日志，因此空目标限制会拒绝合法 fork。自动已读会在编辑重发落盘失败之前，
把新增 pending 轮次改为 seen/read，让回滚凭据失效。工具状态更新还会重验未改动的
工具调用内部未知内容。

待审修复将复制历史插在目标轮次之前，保留已有轮次和容器，拒绝 id 冲突。
回滚只允许本次新增 pending 用户轮次的已读确认，其他字段必须完全不变。
工具状态更新仅解析变化的 status/request/outcome，保留未改内容；其他工具字段修改
仍需完整 item 解析。测试现在安装真实 setup recorder 和自动已读订阅，并使用两个
真实 Loro 副本检查工具未知内容。

这些回归在修复前失败、修复后通过（writer 17 项，fork/编辑服务 35 项）。
它们不能替代多轮独立审查、回滚拒绝条件的补充覆盖、真实 provider 执行或磁盘故障验收。
#460 继续保持 Draft。独立止血补丁是 [#463](https://github.com/LodyAI/Lody/pull/463)，
不包含本 writer。
本次提交前，完整 `pnpm check`、改动文件格式检查和 `pnpm run docs check` 均通过。
独立审查仍待完成。

后续审查发现的权限补字段和 steer 标记问题及修复，见
[业务字段保留](../bug-fix/2026-09-08-history-writer-business-fields.zh.md)。
其中也记录尚未解决的导入 hash 边界；上面的既有测试结果不代表整份 PR 已获兼容性认可。

在此分支替代[临时关闭校验](../bug-fix/2026-09-07-temporary-session-validation-bypass.zh.md)中历史写入的部分。
意图：[Spec 草稿](../../../../specs/session-history-writes.zh.md)。
PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
