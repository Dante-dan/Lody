# Codex 服务档位选择

Status: proposed
Translation: stale

[English](2026-10-12-codex-service-tier-selection.md)

## 摘要

[Issue #1501](https://github.com/LodyAI/Lody/issues/1501) 希望交互式编码能区分普通、Fast 与 ultrafast，并在后续消息和恢复会话时保留选择。当前适配器仅提供 Fast 布尔开关，而固定版本的 app-server schema 已能传递任意服务档位字符串。建议第一步提供按能力发现的 ACP 选择项，以原始档位值传递并由原生 thread 持久化，复用现有客户端配置通道。schema 接受字符串并不证明模型、账号或部署运行时能执行 ultrafast；公布支持前必须验证这条边界。

## 已核对的边界

Lody main `3ac76bad10f46720517a2ca6929f03de4ef5bb9b` 的 Codex gitlink 为 `b67f2eaab63247159c8cbdbd4075334f69729daf`。该版本中：

- `FastModeConfig.ts` 仅检查 `additionalSpeedTiers.includes("fast")`，把布尔值转换为 `"fast"` 或 `null`。生成的 `ServiceTier` 别名仍为 `"fast" | "flex"`。
- `Model.ts` 另有包含目录 id、名称、说明的 `serviceTiers`；`additionalSpeedTiers` 已弃用。`TurnStartParams.serviceTier` 接受字符串并影响后续 turn；`serviceTierForTurn` 是独立的临时覆盖，null 表示继承，`"default"` 才明确请求标准速度。
- 创建/加载状态以 `currentServiceTier === "fast"` 重建 Fast，非 Fast 原生值失去独立表示。不能把发送 null 描述为明确重置普通速度。
- CLI/MCP 已支持 `configOptionValues` 并验证运行时公布的选择项；语义字段 `fastMode` 仍是布尔值。第一步无需另建传输通道。

以上是源码发现，并未执行报告者的环境。[OpenAI API 文档](https://developers.openai.com/api/docs/guides/ultrafast-mode) 描述了 API ultrafast 及不同费用/用量，不代表 Codex ChatGPT 账号或 Lody 托管运行时已有该权限。

## 建议的第一步

Codex 适配器负责发现和传递。仅在原生模型目录提供档位 id 时公布 ACP `service-tier` 选择项；旧目录/客户端保留现有 Fast 开关。复用目录名称和说明并保留原始 id（本次目录使用 `priority`，旧 Fast 使用 `fast`），提供明确的标准速度重置及额外费用/用量提示，不虚构价格。区分请求档位与原生报告档位：实际值未知就是未知，不能显示 ultrafast 已确认。

明确选择通过原生 `serviceTier` 持久化；load/resume/fork 从 thread 元数据恢复。仅有意临时覆盖才用 `serviceTierForTurn`。切换模型按新目录重新验证；不可用的显式选择在启动 turn 前拒绝，不静默改成 Fast。运行时/账号拒绝保留结构化提示或错误；只有原生证据明确实际档位才能显示降级。

宿主渲染公布的选择项并使用现有配置通道。CLI/MCP 通过 `configOptionValues` 传同一 id 和合法值。旧 `fastMode` 保持 Fast 含义，不代表 ultrafast；以后新增语义 CLI 快捷参数时，必须说明两种输入同时存在的优先级。

本提案不增加能力、迁移或批准保证。现有私有 run-config draft 管理未发送的 UI 修改，不是原生 thread 档位持久化，不能改作运行时持久化承诺。若最终实现确需持久化/兼容性 Spec 变更，需保持 draft，直至有该修订的明确人工批准链接。

## 验收与缺失证据

适配器行为测试覆盖目录选择、旧 Fast、非法/切模型选择、准确 `turn/start` 参数、普通速度重置及非 Fast load/resume/fork 往返。宿主/CLI/MCP 测试覆盖通用选择通道与语义 Fast 冲突。合成协议测试只证明传输行为。

宣称 ultrafast 支持前，需在支持的原生运行时/模型/账号上发现目录、选择 ultrafast、核对接受后的 turn 元数据、发后续 turn、恢复后再测，并验证旧运行时/无权限账号行为。使用 codex-cli 0.161.0 和临时独立安装的 0.162.1 分别执行无生成 `model/list` 探测，两次均返回七个模型；全部仅公布 `serviceTiers: [{id: "priority", name: "Fast", ...}]` 和旧 `additionalSpeedTiers: ["fast"]`，没有 ultrafast。适配器本地安装的 binary 为 0.159.2。探测采用临时原生 home 和只读现有认证链接，结束后终止进程并删除临时 home；0.162.1 探测验证了报告所述版本在本地账号/目录下的结果，但不代表报告者环境或付费推理请求。尚未完成原生生成、ultrafast 真实权限、费用测量或打包客户端 UI 验证。该提案没有上游 PR 或维护者批准。

## 证据

- [固定适配器源码](https://github.com/LodyAI/acp-extension-codex/tree/b67f2eaab63247159c8cbdbd4075334f69729daf/src)：`FastModeConfig.ts`、`CodexAcpServer.ts`、`app-server/v2/{Model,TurnStartParams}.ts`。
- 宿主：`apps/cli/src/commands/session.ts`、`apps/cli/src/mcp/lody-mcp-server.ts`。
- [现有 draft 所有权](../../../../specs/session-run-config-drafts.md)。


## 作者补充目录证据后的参考实现

作者在 [新增评论](https://github.com/LodyAI/Lody/issues/1501#issuecomment-6120987283)
给出了 codex-cli 0.162.1 的 `gpt-6-astra` 目录，其中包含独立的 `priority` 和
`ultrafast`。此前“缺少目录证据”的等待已失效；服务端实际执行和账户资格仍未验证。
参考代码增加原生目录驱动的 `service-tier` ACP 选项，保留 new/load/fork 元数据中的
原始字符串并传入 `turn/start.serviceTier`。`inherit` 为 null，`default` 明确恢复标准档。
无效选择和换模型后不再提供的档位会在发送前拒绝；旧 Fast 控件继续兼容，修改它会替换
显式档位。CLI/MCP 可使用既有 `configOptionValues`，不要同时提供相冲突的 Fast 输入。
显式选择会先调用实验性的 `thread/settings/update`，确认后才修改本地状态，再传给
`turn/start`；原生拒绝时保留旧选择。安装版本 0.159.2 和作者版本 0.162.1 的实验 schema
均允许此字段，稳定 schema 不包含该方法。`inherit` 保留原生设置不变。打包 UI 与原生
账户实际执行仍未验证；这只是参考代码，不代表全部需求已上线或解决。英文正文已更新，
因此本译本仍标记 stale。


参考验证：五个现有 adapter suite 共 55 项行为测试通过，涵盖精确档位传递、原生设置
写入、拒绝时旧选择保留、换模型拒绝、load/fork 恢复。adapter typecheck 在未修改的
`ModelConfigOption.ts` 停止，因为已安装 Core 声明缺少 `LodySessionConfig` 导出。
根目录 `pnpm check` 完成 adapter build，随后在无依赖的 `e2ee-core` typecheck 失败，
后续根检查未运行。文档和 diff whitespace 检查通过。没有原生推理、打包 UI、计费或
服务端实际档位验证。
