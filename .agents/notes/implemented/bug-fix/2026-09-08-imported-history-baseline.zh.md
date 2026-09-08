# 分开记录来源 hash 与实际存储内容

Status: implemented
Translation: current

[English](2026-09-08-imported-history-baseline.md)

## 摘要

新 history writer 会裁掉合法 provider 扩展字段，因此用原始来源 hash 比较写入后的历史，
会错误阻塞后续刷新。导入现在保留来源 hash 和 id，并在文档 cursor 中另存实际内容基线。
已有内容（包括旧扩展字段）必须精确匹配，用户删除字段不能被误认为正常裁剪。
这新增可选 cursor 元数据，不迁移旧正文，也不会让旧导入器自动理解新基线。

## 职责与取舍

Hash 归导入器，既有 HistoryWriter 继续独占历史写入。SessionDocument 提供无 await
间隙的写历史、捕获结果、写 cursor 顺序；repo 持久化与远端同步仍是不同完成边界。
基线沿用既有 hash 范围，只覆盖 role/items/plan，不覆盖任意轮次元数据。

带版本的基线编码为一个 primitive JSON 字符串，避免 CRDT 把两个记录逐字段混合。
它绑定文档 cursor 自己的来源 hash digest 和长度；未知、损坏或过期基线退回严格的来源
比较，不宽松放行。旧来源 hashes 和生成的 ids 不变。已验证的旧前缀值和容器保留，
只有新追加内容采用当前 writer。

没有采用“原始或裁剪后任一匹配”：用户恰好删除被裁字段时会被误判为合法。
也没有重算所有旧正文的来源 hash，那会构成迁移并改变导入身份。只有通过检查的
导入/刷新或显式冲突替换会记录实际基线。来源 digest 相同也不能跳过内容检查；
删除旧轮次现在报告冲突，不再自动补回。

## 证据与边界

正式真实 SessionDocument/LoroRepo 回归修复前失败：合法 ACP `locations.endColumn`
使第二次导入冲突。修复后可以追加下一轮。另测旧字段/CID 保留、字段及轮次删除、
本地追加、旧 cursor 基线失效、冲突元数据先更新、写入边界到达的另一副本修改、
快照重开和旧 cursor reader，以及显式解决冲突和重复解决。

另一副本的正文可能先于 cursor 到达。只解析来源的新后缀来预测其存储 hash，不重验
已经导入的旧前缀。已到达后缀精确匹配时只推进 cursor，不重复插入轮次。非法历史命令
不会修改正文或 cursor。定向测试 44 项通过（14 项真实 writer 集成用例、30 项既有
决策/持久化用例），fixture 均为合成数据。
全仓 `pnpm check`、最终 CLI 类型检查、改动文件格式检查与文档检查也通过。
这是本地验证，不代表批准合入。

Provider 和远端确认是桩；这些测试不是磁盘崩溃、网络、旧发布应用或 3000 轮验收。
旧导入器仍可能对裁剪后的历史报告冲突：新字段可被旧 reader 忽略，不等于任意降级安全。
历史与 cursor 是有序的本地 CRDT 操作，不是新增分布式事务或跨对象持久化保证。

本记录解决[业务字段修复](2026-09-08-history-writer-business-fields.zh.md)中的待定 hash 决策。
契约：[草案 Spec](../../../../specs/session-history-writes.zh.md)。
PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
