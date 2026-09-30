# Operation 失败原因

Status: proposed
Translation: current

[English](2026-09-30-operation-failure-reasons.md)

## 摘要

Issue #1174 指出目标鉴权失败经过 Operation 边界后丢失可行动原因。
此提案保留 `TARGET_FAILED`，在短消息中提供已知原因，并标记三个已知
临时原因可重试。只读取下一个用户 Turn 前的通知，省略任意提供方文本。
现有 coordinator 套件通过；完整检查尚未完成，Spec
没有获得人工批准。

## 决策与限制

没有复制原始通知消息，因为其中可能包含私有路径和提供方诊断。请求方
的短消息只包含稳定原因。缺失或未知通知保留原先通用结果。排队的用户
Turn 会使通知关联产生歧义；保守区间规则宁可省略原因，也不借用后续
Turn 的失败。

考虑过增加有类型的可选错误字段，但旧读取方使用 strict schema，
会拒绝整个完成结果。保留既有 code、message 和 retryable 字段，避免改变
持久化和传输结构。独立结构化原因需要后续显式版本协商契约。

相关决策：[本地编排](../../implemented/architecture/2026-09-29-local-session-orchestration.zh.md)。
意图：[draft Spec](../../../../specs/session-orchestration.zh.md)。
来源：[Issue #1174](https://github.com/LodyAI/Lody/issues/1174)。

## 验证

此提案源码的 coordinator 自带套件通过 82 项，包含鉴权、临时原因、
提供方文本省略和后续 Turn 隔离。完整 check、docs check
尚待完成。这是 WIP，不是已投稿贡献或经过人工评审的意图。
