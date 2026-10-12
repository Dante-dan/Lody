# 问题卡中的计划详情渲染为 Markdown

Status: implemented
Translation: current

[English](2026-10-12-question-plan-markdown.md)

## 摘要

通用问题卡使用共享 Markdown renderer 渲染问题正文。DeepSeek Harness 将完整计划详情放在该正文中，因此标题、列表与代码能保持可读结构，同时保留显式批准选项，不引入 Plan Mode 切换。

## 决策

[Issue #1489](https://github.com/LodyAI/Lody/issues/1489) 报告 Harness 退出计划卡显示原始 Markdown。adapter 已把问题和详情合并为 elicitation description，host 保留为通用问题正文；纯文本渲染丢失其结构。

交互卡和已回答卡均复用现有 compact Markdown renderer，答案 id、标签、custom 和提交行为不变。不把 Harness 路由到 switch-mode PlanPanel：[问题 draft Spec](../../../../specs/deepseek-harness-user-questions.zh.md) 明确要求通用问题卡，不授权权限或模式切换。[原始桥接决策](../feature/2026-09-20-dsh-user-questions.zh.md) 仍适用。

## 验证

依据未变更的 lockfile 恢复依赖后，所属问题卡全部 17 个测试和 components 类型检查通过，覆盖语义标题、强调、行内代码、列表、显式批准提交和已回答回放。这是仓库合成 fixture，不是作者桌面复现。

文档检查、改动范围 Oxlint 和根格式化通过。初次根 `pnpm check` 因 `@lody/e2ee-core` 缺少依赖停止；恢复依赖后该 package 类型检查通过，但没有重跑完整根检查。一次问题卡复核触发既有触摸测试的五秒超时；恢复依赖后使用未改动的默认超时通过。未执行真实 Harness/model 桌面操作。
