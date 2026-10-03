# 本地项目 Apple 目标提示

Status: draft
Translation: current

[English](local-project-apple-targets.md)

Mac 用户同时打开 iOS 应用和普通后端项目。客户端可以在应用项目中突出 iOS Simulator，
同时保留后端项目的模拟器入口。由 daemon 负责发现，避免每个客户端另发文件系统 RPC
并维护一套标记规则。

## 契约

本地项目元数据可以包含 `appleTargets`，其元素为 `{ kind, path }`。kind 为 `xcode`、
`swiftpm`、`expo`、`flutter` 或 `other`，path 相对已注册的项目根目录。这些提示仅用于
排序或强调，不授予路径访问权限，也不选择 scheme。字段缺失或为空时，保留现有
Darwin 加 iOS Simulator 能力判断。

daemon 在注册和根目录变化时发现目标，普通元数据更新保留已发现的提示。扫描根目录和
两级子目录，并额外检查该边界下的 `ios` 目录以覆盖 `apps/<name>/ios`。跳过依赖、
构建、隐藏目录和目录符号链接，明确限制目录、条目、标记读取和结果数量。不可读路径或
格式错误的标记只会漏掉提示，不使项目注册失败。

本实现识别 Xcode project/workspace 目录、`Package.swift`、`package.json` 中的 Expo
依赖和 `pubspec.yaml` 中的 Flutter SDK 依赖。标记存在不证明 scheme 可以构建 iOS。
KMP、XcodeGen、目录内编辑后的自动重新发现、scheme 或路径预选不属于本次首次贡献。
`other` 为未来生产者预留。

## 兼容性

可选字段通过现有 Machine Flock 本地项目行传输。读取者保留已知有效提示，忽略格式
错误或未知类型的提示条目，而不丢弃项目。旧 daemon 不必提供该字段；客户端仍必须
根据机器能力提供模拟器。没有新增 RPC、轮询或云请求。

## 证据

- [Issue #1233](https://github.com/LodyAI/Lody/issues/1233)
- [实现决策](../.agents/notes/proposed/feature/2026-10-03-local-project-apple-targets.zh.md)
- `apps/cli/src/lib/local-project-meta.ts` 及所属测试
- `packages/shared/src/machine-flock.ts` 及所属测试
