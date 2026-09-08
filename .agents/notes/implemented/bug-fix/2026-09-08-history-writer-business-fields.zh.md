# 历史写入保留明确的业务字段

Status: implemented
Translation: current

[English](2026-09-08-history-writer-business-fields.md)

## 摘要

PR #460 在 `71cbb22e` 的复查发现：writer 丢弃已接受 steer 的来源标记，
并因重新解析未修改的旧工具内容而拒绝合法权限补充。现在历史配置明确声明 steer 标记，
新输入解析与读取归一化共同保留；工具状态和描述元数据从已有工具消息定义派生字段解析器，
修改工具身份或内容仍需完整 item 校验。外部历史导入的 hash 不一致尚未解决，
这两项修复不代表整份 PR 可以合入。

## 职责

本次扩展[单一 writer 决策](../architecture/2026-09-07-single-history-writer.zh.md)，
不改变存储布局。原 callback 适配仍进入同一 writer，没有第二套物化器、旧文档迁移或全局校验绕过。

`SessionHistoryInputConfigSchema` 明确声明 `_lodyDeliveryKind: 'steer'`，
不将其发明为 ACP 请求选项；存储读取类型的字段值类型来自同一解析器。
真实读取归一化保留该标记，因此编辑资格检查能在 provider 准备前和提交前拒绝 steer。
闭合新输入对象仍过滤无关未知字段。

工具消息 schema 拥有 status、title、kind、locations 和 permissionRequest 的字段定义。
独立字段组只复用这些解析器，仅解析变化字段；走这条路径时，工具身份和 payload 必须保持相等。
只更新 outcome 仍保留已有请求信息。非法新元数据或内容会在 CRDT 操作前拒绝整条命令，
之后另一条合法命令仍能写入。这不是允许新增未知工具内容。

## 复查证据的纠正

最初的 steer 服务探针用 raw Mirror 数据替代 `getHistory`，错误地认为 base
在准备 provider 前就会拒绝。真实 base 的 `getHistory` 也会归一化掉标记，
但原始历史 callback 在替换前再次检查并拒绝。改用 exact base 服务和真实 reader 后确认，
head 因存储本身已丢标记而丢掉最后这层保护。两侧 `finally` 都可能唤醒 dispatch，
这不能证明新 prompt 已执行。正式回归使用真实 reader 和 writer。

## 验证

- 六个真实权限 producer 回归在修复前失败、修复后通过；另有两个内容变化拒绝用例，
  确认 CRDT 值和版本不变，覆盖两个真实副本和各级旧容器身份保留。
- Steer 测试覆盖新增、peer 快照、读取归一化、非法标记拒绝，以及真实执行服务
  的 ownership transition 后进入真实编辑重发服务；类型契约在编译期拒绝非法标记。
- 本地测试不代表 provider 网络、磁盘持久化或 3000 轮产品验收；未提交用户对话 fixture。
- 完整 `pnpm check`（类型、lint、仓库测试、i18n 和边界检查）、文档检查与改动文件格式检查通过。
  独立复核未发现这两项修复新增 P0/P1；hash P1 仍未解决。

## 待定的 hash 决策

导入器记录来源 hash，而新写入可能保存转换后的值。若接受原始或转换后任一表示，
就无法区分正常的新存储与旧历史中恰好删除被过滤字段的用户修改，不能称为严格冲突识别。
拟议的存储基线必须绑定文档 cursor 自己的来源 hashes；新增这种持久化元数据需要明确决定。

后续[实际存储基线修复](2026-09-08-imported-history-baseline.zh.md)解决了上述待定问题，
保留旧来源 hashes 和正文不变。
这两项修复没有加入该格式变化。

契约：[Spec 草稿](../../../../specs/session-history-writes.zh.md)。
PR：[#460](https://github.com/LodyAI/Lody/pull/460)。
