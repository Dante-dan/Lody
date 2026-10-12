# 显式 Windows ARM64 安装包入口

Status: proposed
Translation: current

[English](2026-10-12-windows-arm64-packaging.md)

## 摘要

Snapdragon X 用户希望使用原生 Windows ARM64 安装包，减少 x64 仿真的开销。
新增显式 ARM64 NSIS 构建命令，复用现有打包包装器及按目标选择的原生依赖，
保留通用 Windows 命令。现有源码已建模 Windows ARM64 原生绑定，但选择该目标
与证明可用发布是两件事。原生 Windows ARM64 打包探针及设备测试尚未执行。

## 决定与证据

[Issue #1494](https://github.com/LodyAI/Lody/issues/1494) 优先请求 Windows ARM64；
Linux ARM64 是可选需求，不在本次范围。`build:win:arm64` 与 `build:win` 构建相同的
本地 OSS 组合，再经 `apps/electron/scripts/package-electron.mjs` 选择
`--win nsis --arm64`。包装器保持默认不发布；发布自动化、签名凭据、更新通道和
现有架构默认值均未改变。

锁文件固定 Electron 44.7.0、better-sqlite3 13.0.3、@lydell/node-pty 1.2.0-beta.14、
@loro-dev/roost-node 0.1.2 和 @napi-rs/keyring 2.1.0。Roost、node-pty 和 keyring 的
同版本 Windows ARM64 可选包已记录在锁文件中。官方
[Electron 44.7.0 发布](https://github.com/electron/electron/releases/tag/v44.7.0)
包含 `electron-v44.7.0-win32-arm64.zip`。`cli-native-deps.mjs` 按打包目标
选择绑定，包括 Windows ARM64；现有测试覆盖此目标。包声明存在不能证明原生加载成功。

自动为所有通用 Windows 构建增加 ARM64 会改变产物和成本。显式入口允许维护者选择
该目标，同时保留原有行为。安装包发布由发布运维方负责；公开的 `release.yml`
只同步版本并创建仅含变更日志的发布。

## 验收与验证边界

在 Windows ARM64 主机执行 `pnpm --dir apps/electron build:win:arm64`，要求 after-pack
中的嵌入 CLI、ConPTY、SQLite 和 Roost 探针通过。然后在 Snapdragon 设备验证
安装及卸载、渲染器启动、终端、本地会话持久化、keyring 凭据存储及更新元数据。跨主机打包会主动跳过
运行探针，不能证明上述结果。本记录是参考贡献，不是支持该平台的发布公告。

macOS ARM64 上的本地验证通过既有原生依赖和 Sparkle 打包套件（9 个测试）、
`pnpm format` 及文档检查。原生依赖套件通过 fixture 检查 Windows ARM64 目标 staging；
真实原生运行部分使用 macOS 主机绑定。这些结果均不证明 Windows ARM64 的运行支持。
本次未改变依赖版本，清单中增加脚本不改变锁文件依赖图。
