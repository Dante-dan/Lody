# 将 Codex 实时语音收窄为可编辑听写

Status: proposed
Translation: current

[English](2026-10-06-codex-realtime-dictation.md)

## 摘要

Lody 没有语音输入，#1263 作者报告内置 Codex 支持订阅登录的 WebRTC。
第一阶段建议只生成可编辑的输入框草稿，由普通发送操作提交，语音对话单独处理。
独立且短暂的 Codex 语音进程可以保留目标代码会话，让麦克风音频不经过守护进程。
实验协议兼容性、采集清理和采集中编辑尚未验证；仅有通知类型不能证明功能可用。

## 选择与边界

[Spec 草稿](../../../../specs/codex-realtime-dictation.zh.md)记录行为目标。
这是新功能，不是已复现的 bug。作者实验说明需求及可行性，不是本次实际验证。
本次定向搜索没有发现当前有效的 voice/realtime PR。

语音选择已有 Codex 配置，发消息走普通输入框。原生协商归 Codex 适配器负责，共享扩展 DTO 和
能力声明归 ACP Core，不能在 Lody 重复定义。渲染器采集和守护进程信令沿用已认证的本地边界。
不增加 hosted endpoint，不改变当前代码执行 agent。

纯文字 v2 和 websocket 转录不满足订阅 WebRTC 需求。作者指出 v3 需要保留模型音频输出，
从 `oai-events` 的 `input_transcript.added` 取转录；静音不等于模型不会生成回复。
系统听写省去集成，但没有使用请求指定的 Codex 登录；另接转录 API 则增加请求明确不希望承担的
密钥和计费要求。

## 实现顺序与验证限制

1. 对固定版本验证实验请求与事件结构，定义 Core 能力及启动/停止信令契约。
2. 实现适配器负责的短暂语音线程和守护进程清理，不转发音频，不暴露配置凭据。
3. 实现桌面主动开启、音频流向说明、就绪提示、事件身份、草稿插入和取消，补 macOS 权限。
4. 扩展现有行为测试，按仓库 QA 要求验证真实 Codex 与隔离桌面采集。
   实测连接间隔，不能把作者的三秒观察冒充本次结果。

已检查适配器有原生 JSON-RPC 和实时通知，但没有实时启动方法；稳定生成请求不足以承载
实验方法。此设计切片没有修改运行时代码，没有运行原生或麦克风测试，不声称人工批准，
也不能替代实现验收。

## 来源

- [Issue #1263](https://github.com/LodyAI/Lody/issues/1263)
- [Codex app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- `packages/acp-extension-codex/src/CodexAppServerClient.ts`
- `packages/acp-extension-codex/src/CodexJsonRpcConnection.ts`
- `packages/acp-extension-core/src/methods.ts`

## 固定版本结构验证

已运行内置 Codex 0.159.2 的 `app-server generate-json-schema --experimental`，
使用空隔离 CODEX_HOME，无登录、麦克风或模型请求。生成结构确认启动请求需要
`threadId` 和 `outputModality`，支持 v3、WebRTC SDP、`prompt`、
`includeStartupContext: false` 和 `clientManagedHandoffs`。启动响应为空对象，
SDP answer 通过独立通知返回。此结果只验证结构，不证明账户权限或事件行为。
语音线程还需隔离工作目录、禁用 startup context，并拒绝任何工具/代码执行；
不能把静默 prompt 或 clientManagedHandoffs 当成禁止模型启动执行的强制边界。

## 同版本安全发现

已检查官方 rust-v0.159.2 源码：`HandoffRequested` 无论
`client_managed_handoffs` 如何设置，都会进入 `route_realtime_text_input`。
该标记只控制向外转发。启动请求没有工具禁用字段；只读权限和拒绝审批不证明
所有工具都被拒绝。原生边界成立前不接入桌面采集。Core WIP 类型已构建、
类型检查并通过既有测试，但没有适配器声明此能力，也没有验证麦克风行为。

[固定版本原生 handoff 实现](https://github.com/openai/codex/blob/ff6aec96948b70d94983af2641a6b67c94faeff5/codex-rs/core/src/realtime_conversation.rs)
