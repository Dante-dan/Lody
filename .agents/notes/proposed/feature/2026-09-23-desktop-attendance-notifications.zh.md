# 桌面在场时抑制移动端推送

Status: proposed
Translation: current

[English](2026-09-23-desktop-attendance-notifications.md)

## 摘要

用户正在桌面应用工作时，完成和权限通知目前仍会到达其手机。
本方案增加一个有界、工作区级的桌面在场事实，由托管发送端在投递时读取。
它在异常时继续发送移动端推送，并且不依赖机器在线状态、仅会话可见性或逐输入 presence 写入。
公开发布端和托管消费端在关联 Spec revision 获得明确批准前都不实现。

## 拟议职责

- Renderer 观察可见性、焦点和离散输入，本地只保留最近在场时间戳。
- 一个固定大小的 `desktop-attendance` presence 条目按用户和临时应用实例设 key；
  在进入活跃状态时写入，之后不快于现有 30 秒心跳。
- 托管发送端在发送时检查在场状态；最近在场时间不足 60 秒时，只跳过该用户的移动设备。
- `CloudNotificationsPort` 继续携带通知事实，不携带可能过时的在场快照。
  桌面原生横幅保留当前本地检查。

## 证据与替代方案

现有 `session-viewing` 已证明 Renderer 可以发布有界的 UI 来源 presence 值，但它按会话划分，
且只响应文档可见性。不能直接复用：查看会话不证明近期发生输入或窗口有焦点，且会让通知策略
与 PR poller 的调度信号耦合。

机器 presence 被排除，因为 Agent 主机在线不能说明有人正在看桌面。
在每个 CLI 通知调用中传 `attended` 布尔值也被排除：CLI 不拥有 Renderer 交互状态，
而且托管端解析设备前该值可能已经过时。逐次输入写 presence 被排除，因为共享临时队列是
有上限的 liveness 预算。

托管 OneSignal 源码不在公开仓库，这是明确边界，不能借此把该实现移入 OSS。
公开契约可以定义事实和保守的故障行为；托管采用仍是独立实现责任。

## 验证与限制

本轮检查了当前 issue、presence schema 与 Renderer 发布端、桌面通知焦点检查、通知 port
和有效 presence Spec。没有修改运行时代码，也没有运行行为测试。
隔离环境缺少可用的 Node/pnpm 工具链，因此仓库文档命令无法运行；创建 PR 前仍需完成链接和
metadata 检查。

拟议意图：[桌面在场 Spec](../../../../specs/desktop-attendance-notifications.zh.md)。
需求：[Issue #527](https://github.com/LodyAI/Lody/issues/527)。
