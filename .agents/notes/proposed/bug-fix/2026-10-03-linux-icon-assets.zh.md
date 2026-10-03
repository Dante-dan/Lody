# Linux 图标资源

Status: proposed
Translation: current

[English](2026-10-03-linux-icon-assets.md)

## 摘要

Issue [#178](https://github.com/LodyAI/Lody/issues/178) 报告 GNOME 显示通用图标，并指出单尺寸打包资源与窗口身份不匹配两个问题。本参考修改只处理图标资源：从现有图片生成七种尺寸的 PNG，并在打包前检查，避免静默回退到 macOS 图片。应用名称、数据目录和密钥环身份保持现状，因为重命名有兼容性影响。本修改不声称已经修复原始 Ubuntu 任务栏场景；窗口身份仍需单独处理。

## 决定与证据

`electron-builder.yml` 当前让 Linux 使用一张 512 像素 PNG。Issue 的包检查报告 hicolor 目录只有该尺寸。显式提供 16、32、48、64、128、256、512 像素目录可以固定所需资源集合。提交的图片使用 Pillow LANCZOS 从 `apps/electron/build/icon.png` 缩放，未改变图案。打包钩子在原生依赖暂存前验证 PNG 标识及尺寸。

将 `app.setName` 改为 desktop ID 可能影响 Electron 默认值和 Chromium 密钥环身份。这项独立资源修改避开该迁移，不改变已批准产品意图。维护者尚未接受此方案。

## 验证

所属 Node 测试检查提交的资源集合，并拒绝缺失、尺寸错误和无效 PNG。Linux 打包探针及原始 GNOME 场景需要 Linux 打包环境，未宣称通过。

本地检查：两项图标检查测试通过，`pnpm format` 和 `pnpm run docs check` 通过。`pnpm check` 在编译 ACP Claude 子模块时失败，尚未执行到本修改。完整 Electron 测试执行完毕，有 10 项失败；结果本地保留，不宣称通过。
