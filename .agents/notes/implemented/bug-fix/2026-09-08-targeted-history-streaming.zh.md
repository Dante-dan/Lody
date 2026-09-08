# 目标轮次局部流式写入

Status: implemented
Translation: current

[English](2026-09-08-targeted-history-streaming.md)

## 摘要

通用 writer 原先每个流式 chunk 都构造、规划整段历史。现在已有轮次更新只构造目标轮次，
仍由同一个 writer 校验和写入。ACP 纯文本/思考批次使用此路径，工具和子 agent 更新
保留跨轮次归属逻辑。字段筛选器由现有 Zod 定义派生并缓存，不再每个值重复投影和试解析。
这去掉了 writer 的重复工作，没有替换 Mirror reader，也没有消除所有性能边界。

## 职责与兼容

这延续[写侧减负](2026-09-08-history-write-cost.zh.md)，没有第二套 writer 或接入
ConversationView。`updateEntry` 定位实时容器，有 Mirror 时使用对应轮次的当前状态。
目标缺失返回 false，id 不可修改，非法变化在 CRDT 写入前拒绝。定位从最后一轮开始，
旧目标仍可能反向扫描；没有依赖 peer 修改或旧重复 id 假设的持久索引。

SessionDocument 的 `onlyEntryId` 明确约定：已有目标时，callback 只接收这一轮，
必须只返回同一轮。缺失目标继续原有创建流程。ACP 只收窄明确目标的 agent 文本/思考
chunk；工具更新可能属于更早轮次，工具、子 agent 和混合批次必须保留全历史归属逻辑。

入口解析器克隆支持的 Zod 定义，保留 checks/refinements，只把闭合对象的未知键策略
改为过滤。原始 RPC schema 仍严格，开放 JSON 扩展字典仍开放。容器标识清除与 JSON
安全检查保留；不重验或迁移旧存储。

Item 对齐不再反复扫描已消费前缀或创建后缀切片。历史复制一次索引源 id；由于输入 id
已经验证唯一，仍保持取首个源匹配的行为。通用结构匹配和第二次轮次级 materializer diff
仍存在，不是任意历史操作都 O(1)。

## 证据与边界

测试覆盖原 schema 不变/refinement 保留、非法 id/类型写前拒绝、真实 peer 插入/删除、
callback 只接收目标轮次、旧工具归属与缺失目标创建。基准对比裸 Mirror、通用 writer
和局部 writer，并核对最终 JSON 一致。局部场景通过 writer API 修改嵌套工具文本，
不代表 ACP 工具通知使用纯文本快速路径。`streamCommit` 包含 CRDT commit 和同步订阅者，
不等于 Mirror 独占 CPU。

当前安装的 Mirror 使用 Immer 增量应用外部 Loro 事件，并非必然每次重读整个文档。
与 Mirror 自己的 setState 不同，writer 直接提交不能复用预先算出的 Mirror 状态。
这种差异和单元计时都不能证明 UI 快 10 倍或真实桌面/移动端 3000 轮达标。

最终串行基准，三次运行的中位数（每 chunk 毫秒）：

| 历史条数 | 裸 Mirror | 通用 writer | 局部 writer |
| --- | ---: | ---: | ---: |
| 50 | 0.77 | 1.01 | 0.57 |
| 200 | 2.76 | 4.19 | 2.36 |
| 400 | 5.03 | 7.12 | 3.69 |

400 条时，局部路径的 commit/订阅者约 3.55ms，commit 以外约 0.14ms。
这定位了剩余成本边界，不代表 3.55ms 全是 Mirror 独占 CPU。
Seed 仍退化（通用 writer 1558ms，裸 Mirror 1236ms）；两个 writer 的相同初始化路径
也存在计时波动。因此不能声称所有写入都更快，或整体 10 倍目标已经达成。
完整 `pnpm check`、schema/目标轮次回归、格式、文档检查及基准最终状态一致性通过。

PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
