# 隔离非法 ACP 历史输入

Status: implemented
Translation: current

[English](2026-09-08-acp-history-input-isolation.md)

## 摘要

HistoryWriter 会拒绝未来版本的工具 block，而 flush 队列会重复尝试确定性的校验失败。
自动重试原本已有上限，但新通知到来仍会再次触发同一个坏队列前缀。现在工具 block 和
location 明确接受 JSON 协议扩展，坏通知被隔离，不阻塞正常输出。这不放开顶层消息类型，
也不授权任意执行配置字段。

## 责任和已验证修复

- ACP 入口在 enrichment 读取已知字段前解析 content。未知 block 仅接受 JSON，
  排除的已知类型集合从 schema 派生，格式错误的已知变体不能冒充未知数据。
- HistoryWriter 只解析新建或修改的 content block，保留没改的旧坏 block。
  显式提供的协议扩展键可以更新，未提供的旧扩展保留；切换 block 类型不继承旧变体扩展。
- MessageHandler 将确定性失败批次拆到通知粒度，按路径和错误码报告并消费坏输入。
  暂时性失败继续保留原有逐通知重试进度和附件上传缓存。
- 保留 tool `_meta` 和 location 列号及扩展。任意 `env` 不是 session 配置；
  新选项应放入已声明的 `configOptionValues`。新增嵌套类型检查覆盖 item 和 inputConfig。
- 导入回归现在要求 endColumn 被保留。旧投影文档仍可能依赖存储基线，因此没有迁移或删除它。

## 证据和边界

真实 writer 和 MessageHandler 测试覆盖坏工具输入前后的正常文本、后续 flush、未来 JSON
block、坏已知 block、旧坏 block、扩展保留和跨变体字段污染。相同 schema/输入的纯解析
微基准（100 条，每条 20 个工具项）从候选筛选前的 123–135ms 降到 40–45ms。
这不是完整 writer、桌面/移动端或 3000 轮验收。快照拷贝承担来源保护，没有直接删除。

验证：全仓 typecheck、`check:quick` 和 shared 的 1062 项测试通过。
完整 CLI 测试 2636 项通过，4 项跳过。
完整 `pnpm check` 在 components 的一项头像缓存断言失败后停止；该文件单独重跑
5 项全部通过，不能据此称全量检查通过。文档和改动源文件格式检查通过。

评论中的 stale rollback 恢复问题仍独立待办：不能覆盖 peer 编辑，但可见恢复路径还需要
产品选择。本记录不宣称恢复方案或 main 分支同步已经完成。
PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
