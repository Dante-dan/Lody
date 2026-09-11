# 为 macOS 配置的本地网络端点声明访问用途

Status: implemented
Translation: current
PR: https://github.com/LodyAI/Lody/pull/594

[English](2026-09-11-macos-local-network-permission.md)

## 摘要

打包后的 macOS 桌面应用会启动 Agent helper，并连接用户配置的网络端点，其中可能包括本地
网络服务。macOS 会把 helper 的本地网络访问归属到负责它的应用，因此现在由应用打包后的
`Info.plist` 提供清晰的 `NSLocalNetworkUsageDescription`。Lody 不浏览或注册 Bonjour 服务，
所以刻意不声明 `NSBonjourServices`；本改动为系统权限提示提供用途说明，但不声称能诊断所有
DNS、TLS、代理或路由故障。

## 决定与范围

- `apps/electron/electron-builder.yml` 负责打包后 macOS `Info.plist` 的附加字段；本地网络用途
  文案说明 Lody 会连接用户配置的服务。
- 不给子 Agent 进程增加独立声明。Apple TN3179 说明 macOS 会追踪发起访问的 helper 所属的
  responsible code，并为容器应用整体记录用户选择。
- `NSBonjourServices` 保持缺失，因为 Lody 连接任意用户配置端点，不会注册或浏览特定 Bonjour
  服务类型。
- 本补丁不改变重试、DNS、TLS、代理、诊断、entitlement 或网络发现行为。如果授权后报告中的
  连接仍然失败，这些方向应作为独立问题继续调查。

## 证据与限制

打包回归测试通过 Electron Builder 自身的配置读取器加载配置，再检查解析后的 macOS
`extendInfo` 对象是否包含用途说明且不含 `NSBonjourServices`。格式化、文档检查和受影响测试套件
的结果记录在 PR 交接中。这属于配置级验证；没有打包、签名或启动发布版，也没有在另一台 Mac
上触发隐私提示，更不能证明本地网络隐私是 issue 592 所述问题的唯一原因。

Apple 参考：[TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)。
