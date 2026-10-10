# 运行时拥有的可选能力

Status: draft
Translation: current

[English](runtime-capability-installation.md)

用户配置已保存的本地 Kimi Provider 时，可以在 Lody 中浏览 Computer Use 与 WebBridge，查看安装和前置条件状态，并明确确认安装。探测、下载、安装和数据目录由运行时拥有。Lody 只转发请求，不写入 `KIMI_CODE_HOME`，也不将安装成功当作控制电脑或浏览器的授权。

版本化 ACP `runtimeCapabilities` 声明决定是否支持。没有声明时，客户端报告不支持，不发送安装请求。每项能力安装均需明确确认。原生就绪状态、安装错误和缺失前置条件分别显示；软件下载完成不代表系统权限已授予或浏览器扩展已连接。

参考实现覆盖本地桌面 Provider 设置。本阶段不覆盖远程传输、尚未保存的 Provider 配置和流式进度。需要人工审核的产品与安全决策是：是否采用运行时拥有安装、用户单独确认的职责边界。本草案尚未获人工批准。

## 证据

Issue [#798](https://github.com/LodyAI/Lody/issues/798)；共享合同 `packages/acp-extension-core/src/runtime-capabilities.ts`；运行时 facade `packages/acp-extension-kimi/packages/klient/src/core/facade/global.ts`；客户端 `apps/cli/src/agent/runtime-capabilities.ts`；设置 `packages/components/src/components/settings/runtime-capabilities-field.tsx`。源码验证不证明 managed runtime artifact 已发布。
