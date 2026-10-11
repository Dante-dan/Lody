# 调查 Node 26 Streams 连接超时

Status: proposed
Translation: current
Issue: https://github.com/LodyAI/Lody/issues/1420

[English](2026-10-12-node26-streams-connect-timeout.md)

## 摘要

Issue #1420 报告 CLI 0.104.0 在 Node 26.4.0 下每十秒重连 presence、无法同步元数据，同机 Node 22 正常。锁定的 Streams SDK 中，十秒期限约束初始 HTTP 连接及响应头；fetch 返回后定时器即被清除，并不约束正常 SSE 响应体的存活时间。当前源码未确认与 Node 版本有关的具体缺陷。修改运行时支持范围或延长期限，需要来自受影响认证连接的进一步证据。

## 源码发现

调查的 Lody 提交为 `987962e77022df6a800f4e889f124b51f6eb8056`，CLI manifest 版本为 0.104.0，锁定 `@loro-dev/streams-crdt` 0.16.2、`@loro-dev/streams-client` 0.9.0 和 `loro-repo` 0.22.0。

- [CLI transport](../../../../apps/cli/src/utils/http-transport.ts) 启动时安装支持代理的 Undici 全局 dispatcher，默认 HTTP/1，并启用地址族自动选择；HTTP/2 需要明确开启。
- [Presence](../../../../apps/cli/src/lib/loro/presence.ts) 使用 SDK 默认 fetch。SDK 的 `readEphemeralSse` 通过 `fetchAuthorized` 使用 `connectTimeoutMs`；响应头返回后，`fetchWithTimeout` 在 `finally` 清除中止定时器。SDK 默认期限为 10,000 ms。
- [持久化元数据及文档](../../../../apps/cli/src/lib/loro/streams-transport.ts) 使用 `StreamsTransportAdapter`，其锁定版本的公开配置不支持注入 fetch。仅让 presence 改用项目 Undici fetch，不能解释或修复同时报告的元数据失败。
- Presence SDK 支持独立 fetch 实现，但 Node 版本相关性不能确定故障在原生 fetch、已安装 dispatcher、DNS/TLS 还是认证服务器交互。未认证端点可达以及其他公开 SSE 正常，未覆盖同一协议。

## 决定与限制

在定位失败边界前保留运行时支持范围与连接期限。已有 `LODY_HTTP_TRANSPORT=node` 开关可在全新启动的 daemon 中区分自定义全局 dispatcher 与 Node 默认 dispatcher。`LODY_HTTP_TRANSPORT_DIAGNOSTICS=1` 提供连接与 ALPN 信息，无需公开凭据；分享前仍需删除 token、stream/workspace 标识与私有会话内容。

本地 OSS composition 没有已认证的托管 Streams bridge。仓库现有测试可以检查 transport 与 presence 行为，但不能替代受影响认证请求的时间线，也不能证明报告中的 macOS 27 / Node 26.4 场景已修复。

## 验证

调查提交下，CLI 原有 `http-transport.test.ts` 和 `presence.test.ts` 分别在 Node 22.16.0 和官方 Node 26.4.0 Darwin ARM64 上通过：每个运行时两个文件、二十项测试。Node 26 安装包的 SHA256 与[官方发行公告](https://nodejs.org/en/blog/release/v26.4.0)一致。这仅是基线证据，不声称产品修复或受影响机器复现。

文档 status/check 与格式化完成。完整 `pnpm check` 已启动，但在 ACP Claude TypeScript 构建仍进行时被中止，未记为通过。此分支仅含调查笔记，没有产品改动。
