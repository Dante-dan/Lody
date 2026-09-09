# Grok ACP 权限兜底

Status: draft
Translation: pending

## 场景与意图

用户选择 Always Approve（YOLO）后，官方 Grok 仍可能发送工具权限请求。
Grok ACP 扩展应直接处理这些请求，避免客户端显示需要用户批准的中间状态。

## 权限模式

- Grok 扩展及 Lody 静态能力只提供 Ask、Always Approve，不再提供 Auto。
- 恢复旧会话配置时，原 Auto 值按 Ask 处理；不得转换为 Always Approve。
- 运行中的配置请求若选择 Auto，应返回不支持，保持之前的模式。
- 发送已支持权限选择时，明确关闭官方 auto mode；运行中仍使用官方通知入口。
- 输入框选择继续遵循现有的提交后生效语义。本改动不增加活动回合实时配置入口。

## YOLO 自动回应

- 对已知会话，扩展按该会话所属客户端已接受的权限模式判断是否为 YOLO。
- 对新的标准 `session/request_permission` 请求，优先选择 ACP kind 为
  `allow_once` 的选项；若没有，则选择 `allow_always`。
- 只选择请求提供的有效字符串 optionId，依据 kind 判断允许，不能按标签或 id
  中是否包含英文 allow 来猜测权限。
- 将 `selected` outcome 直接返回官方运行时，不把同一个请求转发给客户端。
- `allow_always` 可能在官方运行时保存持久授权，这是仅有该允许选项时的兜底语义。
- 请求没有可用允许选项、会话未知、模式为 Ask 或属于用户问题、模式切换审批时，保留交互。
  标准 elicitation 不参与自动批准。
- 请求 id 必须在各方向独立处理，不能因反向请求 id 相同而消费客户端的待回应请求。
- 已经转发给客户端的请求继续由客户端负责，本改动不抢答这些请求。

## 记录与边界

扩展自动回应的请求不会创建 Lody 的 permissionRequest/outcome 历史条目。
普通工具执行更新仍正常转发。Lody 保留对旧扩展及已转发请求的客户端兼容处理，
该兼容处理仍只选择 `allow_once`。

扩展接受的权限选择不是官方运行时状态确认。此兜底不能绕过运行时直接拒绝的操作，
也不改变其他 Provider 的权限行为。

## 实现证据

- [扩展](../packages/acp-extension-grok/src/proxy.js) 与
  [测试](../packages/acp-extension-grok/test/proxy.test.js)。
- [静态能力](../packages/shared/src/ai.ts)。
- [实现记录](../.agents/notes/implemented/bug-fix/2026-09-08-grok-acp-permission-fallback.zh.md)。
