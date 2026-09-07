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

替代[临时关闭校验](../bug-fix/2026-09-07-temporary-session-validation-bypass.zh.md)中历史写入的部分。
意图：[Spec 草稿](../../../../specs/session-history-writes.zh.md)。
PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
