# 按目标模型验证冻结的 Session 创建选项

Status: implemented
Translation: current

[English](2026-10-02-session-create-target-model-validation.md)

## 摘要

Session 创建接受了非探测模型的语义推理配置，却在持久化执行时拒绝相同的具体选项。探测快照的推理档位属于另一模型，导致 Session 无法创建，直到 Operation 超时。创建验证现在从已保存的模型和选项重新计算目标模型的推理与 Fast 豁免，沿用 chat 的验证规则。既有冻结 Operation 与 Role 创建无需迁移即可受益；未知目标能力仍交运行时验证。

## 决定

Issue [#1215](https://github.com/LodyAI/Lody/issues/1215) 指出了语义接受与具体重放的差异。`resolveEffectiveSessionCreateDispatchConfig` 在快照选项验证前，将语义解析器的已验证 ID 与 `validateModelDependentTurnConfigOptionValues` 的结果合并。顶层模型优先于模型选项，与实际分发一致。目标模型声明的限制以及无关选项的验证仍保持。

持久化临时验证 ID 或语义 run config 需要修改 schema，无法覆盖已有 Operation，也不能统一具体 Role 配置。从现有字段重新计算可覆盖这三条路径。本修改恢复已有的模型相关验证约定，不改变 Spec 意图。确定性失败的重试分类和 composer 菜单属于独立问题，本次不修改。

## 验证

Session command 原有测试套件以合成机器能力行调用真实 `prepareSessionInput`，覆盖语义创建后 JSON 冻结的具体重放、Role 风格模型选项、探测模型或目标声明不支持的档位拒绝，以及未知选项拒绝。未运行真实 Devin ACP 或 daemon 重试调度；已覆盖共用的准备边界。
