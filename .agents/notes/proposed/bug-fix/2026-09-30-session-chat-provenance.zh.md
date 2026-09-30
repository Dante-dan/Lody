# Session chat 发送方来源

Status: proposed
Translation: current

[English](2026-09-30-session-chat-provenance.md)

## 摘要

Session chat 原先显示为普通用户文本，难以辨认实际作者。此方案记录服务端
推导的发送方来源，并以生成的非人类提示和 JSON 引用包装正文。范围涵盖首次
MCP chat、chat-many 与持久化重试，不改变授权身份。此次文本降级不包含
provider 原生角色元数据。

## 决定与限制

关联 LodyAI/Lody#1173。发送方取自当前 invocation 或冻结的 Operation，
不取自正文中的标头。目标历史与派发 prompt 都保留生成的提示，input
configuration 保存有长度约束的来源字段。JSON 引用使伪造标头留在正文中，
无法生成额外的外层来源行。普通 CLI 人类 chat 不带来源，行为保持原样。
来源证据不构成授权边界，也不保证防止 prompt injection。

现有 Session orchestration Spec 仍为 draft。需要相关 helper、parser
和真实 HistoryWriter 快照测试。完整检查与 provider/UI 运行验证必须按实际
执行报告，不能假定已通过。
