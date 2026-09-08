# 降低历史写入开销

Status: implemented
Translation: current

[English](2026-09-08-history-write-cost.md)

## 摘要

单一 writer 增加了可避免的解析、整轮读取和快照复制。现在字段更新只读取目标字段，
带 discriminator 的 schema 使用索引，新值不再合并不存在的旧扩展。
这些措施降低写侧开销，不取消校验或快照来源保护。带全量 Mirror 的基准中，流式路径
仍慢于裸 Mirror，因此这不是整体 10 倍性能验收。

## 修改与边界

- 从 Zod literal 定义派生 discriminator 索引；保留最终解析，无法索引的结构保留回退。
  唯一候选不再试解析。
- 去除容器标识时，仅在实际变化处复制，仍检查循环引用。新值没有旧扩展，直接使用解析结果。
- `setField` 定位轮次一次，只读取并 diff 目标字段。非法更新仍保留旧值，旧扩展也不丢。
- 写入规划不再为未变轮次读取 Loro 包装对象。只有历史变化时，不再额外调用控制面 Mirror 写入。
- 初始历史一次提交，不再每轮提交一次。
- cursor hash 直接读取脱离存储的 JSON，不再先创建来源凭据再复制。
  Fork/回滚的快照来源保护保留；hash 仍扫描历史，回滚仍捕获前后状态。

这是[输入隔离](2026-09-08-acp-history-input-isolation.zh.md)之后的写侧减负，
不是 ConversationView 读架构。没有存储迁移、放宽解析或新增 writer 开关。

## 复测与限制

运行 `bun packages/shared/tests/history-writer.perf.ts`；可用 `HISTORY_BENCH_TURNS`
和 `HISTORY_BENCH_SAMPLES` 选择规模和次数。全量 Mirror 场景每条 20 个合成工具项，
包含嵌套文本更新、标量修改、追加，并核对两条路径最终 JSON 一致。
独立字段场景使用 20 个工具输出，每个重复合成字符串 2000 次，无 Mirror 订阅，
翻转字段 100 次，不代表 UI 延迟。

与修改前 `f0523d8a` 比较，独立字段更新从约 0.225ms 降到 0.006–0.007ms
（Bun 1.3.14，预热后样本）。首批 200 条全量 Mirror 复测中，整段写入有所改善，
但流式路径仍慢于裸 Mirror。这不是评论原始数据/运行时；这些数字和正确性测试
都不能证明 3000 轮达标，不能据此将整体性能门槛标为完成。

最终 200 条、三次运行的中位数（毫秒，同一合成数据）：

| 路径 | 修改前 | 修改后 | 复测时的裸 Mirror 对照 |
| --- | ---: | ---: | ---: |
| 整段写入 | 858 | 720 | 570 |
| 文本 chunk | 4.18 | 4.10 | 2.63 |
| 标量字段 | 2.22 | 1.93 | 2.52 |
| 追加 | 3.59 | 2.95 | 2.14 |

文本 chunk 的差异太小，不能宣称明显改善。两条路径使用相同的已安装 Mirror/schema，
关闭全状态校验；这是隔离 writer 的比较，不是与当前 main 的独立构建比较。
完整 `pnpm check`、docs check、shared 类型检查和最终基准的 JSON 一致性检查通过。

PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
