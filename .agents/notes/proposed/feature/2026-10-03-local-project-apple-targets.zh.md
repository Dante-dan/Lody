# daemon 负责的 Apple 目标提示

Status: proposed
Translation: current

[English](2026-10-03-local-project-apple-targets.md)

## 摘要

客户端目前需要各自探测文件系统，才能区分 iOS 项目和普通 Mac 项目。本提案在 daemon
负责的本地项目目录中发布有界、可选的提示，保留工具可用性和现有本地优先同步路径。
标记检测可能遗漏大型或深层项目，也可能识别出不能构建 iOS 的 Swift 包，因此提示不是能力。

## 决策与备选

使用现有 Machine Flock 行，不另加 RPC 或客户端扫描器。daemon 在规范化根目录的注册
或变更时检测，连空结果也缓存，避免历史或显示元数据更新触发文件系统工作。每次更新
都扫描能更早发现目录内编辑，但会给无关更新增加重复工作，暂缓该刷新策略。

扫描最多读取 64 个目录、每个目录 256 个条目、每份标记 64 KiB，产出最多 32 条提示。
跳过符号链接和依赖、构建、隐藏目录。通用两级子目录再加最终 `ios` 目录，覆盖 issue 的
monorepo 例子而不无限递归。不可读或格式错误的标记不会使注册失败。

```text
项目注册或根目录变化
  -> 有界本地发现
  -> Machine Flock 行中的可选 appleTargets
  -> 共享解码器验证已知提示并保留项目
  -> 客户端可排序工具；现有能力可用性不变
```

## 范围与证据

实现 Xcode、SwiftPM、Expo、Flutter 标记。KMP、XcodeGen 和 scheme 预选暂缓；schema
预留 `other`，不凭空猜测规则。现有客户端可用性代码不变，保留旧 CLI 行为。所属测试
覆盖磁盘发现、根目录变化后的发布、普通项目和混合版本元数据解码。

[Spec](../../../../specs/local-project-apple-targets.zh.md) 保持 draft，本决策在上游评审
前保持 proposed。贡献中如实报告验证结果；测试不代表人工批准。

来源：[Issue #1233](https://github.com/LodyAI/Lody/issues/1233)。

相关决策：[模拟器面板](../../implemented/architecture/2026-09-27-ios-simulator-panel.zh.md)
负责工具可用性和生命周期；[侧栏排序](../../implemented/feature/2026-09-20-local-project-sidebar-ordering.zh.md)
负责个人项目排序。本提示不改变这两项责任。
