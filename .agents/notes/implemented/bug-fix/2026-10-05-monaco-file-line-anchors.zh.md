# 在 Monaco 初始化期间保留文件链接行锚点

Status: implemented
Translation: current

[English](./2026-10-05-monaco-file-line-anchors.md)

## 摘要

首次点击文件链接时，长文件开启自动换行后可能仍停在开头，目标行也没有可见高亮。控制器现在先把目标写入 Monaco 光标状态，再立即滚动，使语言初始化和换行布局保留锚点。行装饰使用 Monaco 随主题变化的 `rangeHighlight`，替代没有定义的应用类名。修复不引入重试定时器，也不改变文件访问；打包桌面验证与合成浏览器回归仍是不同证据。

## 决策与证据

[Issue #1253](https://github.com/LodyAI/Lody/issues/1253) 报告 macOS 上 Desktop 0.103.0 的问题，并提供 6,600 行控制器复现。原控制器平滑滚动到目标，但光标仍在第一行，后续语言设置和换行布局可能保留该光标位置。两个装饰类名均没有 CSS 定义。

先把光标移到归一化后的起始行，再用 `ScrollType.Immediate` 揭示目标。保留现有整行范围归一化，使用背景随 Monaco 主题变化的内置 `rangeHighlight`。不增加会与后续用户导航竞争的延迟滚动重试。既有光标回调继续报告实际本地位置；范围变化或清除仍通过原有装饰所有者更新。

## 验证与限制

现有 Code Collab Storybook 和 Playwright 套件加入合成 6,600 行 TypeScript 文件，覆盖冷启动窄查看器、语言加载、扩宽、可见主题高亮和重复导航。components 类型检查、格式化、diff check 和 docs check 通过。Storybook 切换为轮询监听后 Playwright 已进入测试，但 Chromium 在断言前因 macOS MachPortRendezvous 权限拒绝（1100）退出；不声称浏览器测试通过。此测试不运行已安装桌面应用，也不捕获用户文件或对话。
