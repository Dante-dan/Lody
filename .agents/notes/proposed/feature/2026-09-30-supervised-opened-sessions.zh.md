# 在不共享工作区的前提下监督 Agent 创建的 Session

Status: proposed
Translation: current

[English](2026-09-30-supervised-opened-sessions.md)

## 摘要

MCP 创建的 Session 当前拥有独立工作区文档，但也作为需要单独关注的对话显示。
本提案保留隔离执行，把 worker 的状态、结果、未读和权限提醒汇总到发起对话，
只在显式交接时创建用户接管的同级对话。方案需要持久保存监督选择，并修改跨客户端
的路由；本次仅准备供人类审阅的双语 [Spec 草案](../../../../specs/supervised-opened-sessions.zh.md)，
不改变运行时行为。

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
本文没有声称已完成实现测试、真实桌面或移动端验证、维护者批准或人类 Spec 批准。
