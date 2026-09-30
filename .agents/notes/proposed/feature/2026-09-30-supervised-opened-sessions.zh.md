# 在不共享工作区的前提下监督 Agent 创建的 Session

Status: proposed
Translation: current

[English](2026-09-30-supervised-opened-sessions.md)

## 摘要

MCP 创建的 Session 当前拥有独立工作区文档，但也作为需要单独关注的对话显示。
本提案保留隔离执行，把 worker 的状态、结果、未读和权限提醒汇总到发起对话，
只在显式交接时创建用户接管的同级对话。方案需要持久保存监督选择，并修改跨客户端
的路由；本次准备有限参考实现及供人类审阅的双语 [Spec 草案](../../../../specs/supervised-opened-sessions.zh.md)，
现有创建进度卡现在保留 worker 的结果预览；生产监督关系和权限归属不变。

## 决策与证据

[#529](https://github.com/LodyAI/Lody/issues/529) 描述的负担是每个 worker 都成为
侧栏对话，拥有自己的未读和通知，而父对话只看到创建卡片，未看到结果。源码检查也证实
独立 `workContext` Session 和子 Tab 的区别：`lody-mcp-server.ts` 对没有
`workContext` 的同机本地 Agent Role 默认采用 `useCurrentSessionAsParent`；
`session.ts` 禁止该子 Tab 路径附带项目／worktree；当前完成通知发送的是 worker 的
Session id。这些事实说明需要修改注意力路由，同时保留独立存储身份。

拟议产品契约写在 Spec 草案中。实现的第一部分应先让发起对话看见结果和权限等待，
再把 worker 行移入面板。持久化监督字段、发起者消失时的后备路由，以及跨客户端通知
归属仍需人类审定。`openedBySessionId` 本身是历史来源，不能不处理旧数据就当作交接标志。

## 备选方案与边界

把所有 worker 变成子 Tab 可以避免侧栏同级项，却会共享根工作区，使并发文件工作
失去隔离。保留独立侧栏行并静音，只会藏起权限等待。把所有已创建 Session 都视为
受监督任务，也会误分类有意交接和旧记录。草案因此显式区分选择，旧记录在迁移决策前
仍保持原来的展示。

现有 [Session 关系 Spec](../../../../specs/session-relations.zh.md) 仍定义归档、恢复和
删除的目标。[subagent 事件 Spec](../../../../specs/subagent-events.zh.md) 描述一个
Lody Session 中的原生 provider run，不能代替拥有独立文档的 MCP Session。
参考投影未从 shared 包入口导出，也未接入生产消费者。显式关系输入保留旧记录与
交接行为；发起者路由不可用或未知时，worker 的收件箱仍可见。结清只隐藏没有待处理
权限请求的已结束监督工作，不改变文档生命周期。

所属行为测试覆盖 Tab 发起后的根路由、结果预览、权限后备入口、完成后仍待授权、
结清与重新运行、未知观察、旧同级会话及错误的自发起关系。它不验证持久化迁移、
权限传输或真实桌面和移动端行为，也不代表维护者批准或人类 Spec 批准。

## 结果预览实现部分

创建进度此前只记录终态。存在该进度行时，完成卡会去重隐藏，使发起对话看不到成功
worker 的结果。shared 历史规划器现在把 Operation 输出投影为可选预览，折叠空白，
限制到 240 个字符并加省略号。终态行可补充输出而不回退状态。已发布进度缺少预期
预览时，协调器保留完成卡的后备展示；渲染器把预览传给现有创建卡的 detail 字段。
完整输出仍保留在 Operation／worker，不另复制一份对话。

这一部分扩展现有真实 Loro 快照恢复和协调器回退测试，独立于拟议监督关系，
不改变归档、权限、通知或收件箱归属。

## 持久化创建与权限注意力

独立 MCP 创建在 Operation 身份/恢复和 Session 元数据冻结 `openedSessionMode`
（默认 `supervised`，显式 `handoff`）。子 Tab、普通 CLI 创建及旧 Command 不保存
该字段。升级前重试保留原 Command；改变意图或人类身份仍被 store 拒绝。真实
LoroRepo 和 MCP 所属测试覆盖这些边界。

监督 parent 卡现展示持久化权限等待，不改变精确 Operation 状态。点击打开
worker 处理原请求；等待解除时标记消失。handoff/历史 peer/子 Tab 卡保持原样。
worker inbox 隐藏与权限 push 分组尚未完成。

普通完成通知在 opener root 元数据确定、未归档且属于通知接收者时指向 root；
元数据缺失、归档、其他用户或 root 实为子 Tab 时回退 worker。权限请求身份仍
在 worker。现有相关会话树保留计数和导航，在无机器实时 presence 时也显示监督
权限等待。权限推送分组仍未完成；创建 Operation roster 收起行为见下文。

## 发起会话未读汇总

侧栏与会话首页使用仅供呈现的关注映射，把明确受监督的独立 worker 及其子 Tab
汇总到已知、活跃且同属一个用户的根会话。worker 行与独立工作目录保持不变。
未读仍由各会话自己的阅读回执决定；查看根会话不会把未查看的 worker 输出标为已读。
持久化许可等待在没有在线状态时仍可见，Working 仍仅依赖在线状态。Dock 对已汇总
关注只计数一次；根会话缺失、关闭、归档或属于其他用户时保留 worker 回退。此映射
不选择归档、恢复或删除对象。许可推送分组仍未完成，Spec 仍是草案。

完成通知与本地未读汇总使用一致的有效发起者条件：已关闭的发起者不再作为通知目标，改为保留 worker 后备路由。权限请求标识仍属于原 worker。

## 生产创建 roster 的收起操作

创建进度按 worker 分组并显示活跃数量。已结束且没有权限等待的监督 worker 可单项或批量收起。收起只向独立 Session 元数据字段写入创建 Operation 的标识，不改变文档、生命周期目标、已读标记或权限请求身份。运行中、未结束、handoff 或待权限的 worker 不符合条件。写入前重新核对归属、持久化权限等待和当前 presence；worker 恢复运行或出现新权限等待时重新显示卡片和数量。已收起 worker 保留紧凑导航链接。此列表属于创建 Operation，不是跨 Operation 的监督控制台。

权限 push 分组仍需独立协议支持：公开通知和回应 API 只有属于原 worker 的 `sessionId` 和请求身份。需要另加注意力目标及兼容的托管消费者，不能直接替换原会话标识来分组。
