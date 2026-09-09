# Grok ACP 移除 Auto 并在 YOLO 下直接回应允许选项

Status: implemented
Translation: pending

## 摘要

官方 Grok 在 YOLO 下仍可能发送工具权限请求，客户端处理时可能先暴露待批准状态。
本次在 Grok ACP 扩展内直接回应这类请求，优先单次允许，没有单次允许时选择持续允许，
并从扩展和静态能力中移除 Auto。没有允许选项和用户问题仍保持交互，旧 Auto 启动配置
按 Ask 恢复。代价是扩展直接处理的请求不进入 Lody 权限历史，持续允许选项也可能在
官方运行时保存授权；普通工具更新仍转发。

## 决定与已有分析的关系

这是[先前分析](../../proposed/bug-fix/2026-09-08-grok-always-approve-permission-analysis.zh.md)
之后采用的扩展层兜底方案。它替代该分析建议的“在 Lody 历史中原子发布自动批准”作为
新 Grok 扩展请求的处理方式，没有实现输入框实时权限切换，也没有改写先前分析中的
历史证据。产品语义记录为 [Spec 草案](../../../../specs/grok-permission-fallback.zh.md)。

## 实现

- `proxy.js` 去除 Auto 选项和启用 Auto 的通知路径，启动时旧值归一为 Ask，显式发送
  `autoMode=false`；live Auto 请求返回错误，不改变已接受配置。
- `handleRuntimeMethod` 对已知 YOLO 会话的新权限请求，依据标准 kind 先找
  `allow_once` 再找 `allow_always`，直接向 runtime 返回原请求 id 的 selected outcome。
  不向客户端转发已回答的请求，不用文字匹配推测允许。
- 用户问题元数据、标准 elicitation、模式切换审批、未知会话和没有可用允许选项的请求继续透传。
- 保持反向请求与客户端请求 id 空间独立，Ask 模式及其他客户端所属会话不受影响。
- Lody 静态 Grok 能力同步移除 Auto，避免打开选择器时仍提供已移除选项。
- Lody 原有客户端 `allow_once` 路径保留，处理旧扩展和此前已经转发的请求；说明和
  scoped AGENTS 明确这两层的不同责任。

## 验证与限制

扩展测试在临时副本中使用当前 Core 编译产物执行，57/57 通过，覆盖启动及恢复、
模式切换、Plan 审批保持交互、AllowAlways 兜底、客户端隔离、透传边界和双向 id 冲突。
从实际源码提取静态能力常量的探针确认其权限选项与扩展返回列表一致。
扩展 build（JavaScript 语法检查）、修改代码的 Prettier 检查、文档检查及父仓库和
子模块的 `git diff --check` 均通过。文档检查保留 18 条原有 AGENTS 大小警告。
2026-09-09 创建 PR 前，扩展已适配到其 main `f3f59e1`，主仓库集成以
[独立 Plan PR #503](https://github.com/LodyAI/Lody/pull/503) 为基线，使用 Core 0.1.1。
扩展版本升至 0.1.3，使能力缓存识别新的权限选项；依赖解析未改变，无需锁文件变更。
尝试 `pnpm check` 与 `pnpm format`，当前工作树缺少 node_modules，分别在
`tsgo`、`prettier` 缺失处停止。定向检查通过；没有完整应用或真实模型回合验证。

本次修改分为 [Grok 扩展 PR #15](https://github.com/LodyAI/acp-extension-grok/pull/15)
和依赖 #503 的 [Lody 集成 PR #533](https://github.com/LodyAI/Lody/pull/533)。
英文翻译待补。
