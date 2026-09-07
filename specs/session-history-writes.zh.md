# 会话历史写入

Status: draft
Translation: current

[English](session-history-writes.md)

## 场景

同步来的会话包含未来版本的未知 item，或损坏的旧 text item。用户仍应能发送合法消息，
并流式修改另一项。但兼容旧数据不能变成允许本地创建格式错误的新 item。

## 契约

- 前端与 CLI 共用一个 HistoryWriter 进行本地历史修改。读取功能开关可切换视图，不能切换写入契约。
- 新轮次使用明确消息类型和运行时输入解析。原有带类型的 callback 调用通过会话适配层进入同一 writer。
- 一条命令修改历史前，先校验新增轮次和变化的已知字段/item。非法命令报告路径和错误码，
  保留旧值；另一条合法命令仍可执行。不重新校验无关旧 item。
- 闭合的新输入对象过滤未知字段，明确的协议扩展字典仍保存 JSON 数据。
  保留已存储的未知字段，以及未修改的未知/损坏 item；读取不意味着迁移或清理数据。
- 已有 primitive 字符串不升级容器；已有 Text 编辑保留容器身份。存储布局变更单独审查。
- 这里的接受表示本地 CRDT 写入。持久化、权限和远端同步仍由原有 repo 和传输层负责。

## 边界与待审事项

这不是任意跨版本兼容或 reader 安全的证明。TypeScript 无法保证不可信输入、字符串语义约束，
也不能阻止刻意的类型断言/底层访问。修改已损坏 item 的命令可能需要修复该 item，
不能借用针对“未修改历史”的兼容处理。初版 callback 适配支持保持既有轮次顺序的修改，
不支持任意重排普通 LoroList 中的已有轮次。

目前完整 Mirror 读取仍会物化历史，本次不是 3000 轮性能验收或窗口化 ConversationView 上线。
非历史控制字段的校验不属于这个 HistoryWriter 契约。

## 实现证据

- `packages/shared/src/{history-writer,history-write-schema,session-mirror}.ts`
- `packages/shared/tests/history-writer.test.ts` 与 `history-writer.contract.ts`
- [决策记录](../.agents/notes/implemented/architecture/2026-09-07-single-history-writer.zh.md)

这是供人工审阅的草稿；实现和测试通过不代表 Spec 已获批准。
