# 已连接项目筛选

Status: draft
Translation: current

[English](onboarding-project-filter.md)

连接项目较多时，用户应能找到项目而无需滚动完整列表。项目步骤在已有项目时始终显示筛选框。筛选匹配仓库所有者与名称、本地名称与路径、已显示的可见性信息，忽略大小写及首尾空白。筛选只处理已加载的数据，不向服务器发送查询。

筛选时标题显示匹配数量和总数。空结果说明查询并提供清除操作。筛选不改变已选项目，也不改变返回、跳过和下一步。现有选择为单选，本方案不新增多选。

列表挂载时聚焦筛选框。方向键在匹配行之间移动焦点；Enter 选择聚焦行（从输入框则选择首个匹配），不自动前进。Escape 清除查询并将焦点返回输入框。仍支持正常 Tab 导航。

## 证据

- [请求 #1386](https://github.com/LodyAI/Lody/issues/1386)，另有重复 #1387。
- [项目选择器](../packages/components/src/components/onboarding/screens/projects-screen.tsx)。
- [决策](../.agents/notes/proposed/feature/2026-10-10-onboarding-project-filter.zh.md)。
