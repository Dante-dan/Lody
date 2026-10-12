# 让已发送消息编辑器保持右侧对齐

Status: implemented
Translation: current

[English](2026-10-12-full-width-message-editor.md)

## 摘要

宽窗口的全宽对话中，进入用户消息编辑模式会让外层占满可用宽度，但内层限制为 800px 的内容仍停留在起始侧。编辑器因此对齐内层盒子，而不是右侧头像和元数据。在已有内容盒子上使用逻辑方向的自动外边距，可保留宽度上限并使其贴合用户内容列的末端。本次仅修复布局，编辑、提及、保存和附件仍由原有组件负责。下文区分浏览器几何验证与实际环境限制。

## 决定与范围

[Issue #1495](https://github.com/LodyAI/Lody/issues/1495) 报告 macOS nightly 0.105.0-nightly.6 的问题。上游 `3ac76bad` 的 `view.tsx` 中，`UserMessage` 编辑外层使用 `w-full`，内层仍使用 `sm:max-w-[800px]`。普通块布局把限制宽度的内层放在起始侧；内部编辑器的 `items-end` 无法跨越盒子外的空白。

由现有 StyleX conversation surface 用 `marginInlineStart: auto` 控制逻辑末端对齐。扩大宽度上限、调整头像或元数据位置都会改变现有对话几何；对齐受限盒子则保留这些行为。不涉及 Spec、公共 API、Effect 生命周期、数据、provider 或平台契约变更。

已有[编辑与重发提及决策](../feature/2026-09-28-edit-resend-mentions.zh.md)继续负责编辑准入和提及行为。

## 验证

已有 `UserMessageEditor` Storybook 新增全宽的真实 `MessageRowView` 状态。原有 composer 浏览器套件在 1800px 和 600px 窗口比较编辑卡片与元数据的右边缘，通过实际按钮进入编辑、确认焦点并取消回原消息。

仓库类型检查和 lint 均通过。完整 `pnpm check` 随后在脚本测试阶段停止，因为 Node 22.16 无法导入已有的原始 TypeScript session-link 模块。使用 Node 22.22.3 单独运行脚本套件，51 项全部通过；sender-view 定向套件 5 项全部通过。完整命令后续的 workspace 单元测试阶段未运行。格式化和文档检查通过。

Storybook 使用轮询监听器后已就绪，但官方 Playwright Chromium 启动因 macOS MachPort 权限错误失败，尚未进入页面或几何断言。不声称浏览器 RED/GREEN 或视觉验证通过。未运行报告中的 macOS nightly 应用；冻结锁文件安装已链接依赖，但 Electron 缓存 postinstall 被本地文件权限拒绝。
