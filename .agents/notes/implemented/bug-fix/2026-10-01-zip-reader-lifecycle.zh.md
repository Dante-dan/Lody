# 支持的 Node 版本上的 ZIP reader 生命周期

Status: implemented
Translation: current

[English](2026-10-01-zip-reader-lifecycle.md)

## 摘要

Node 24.16 上的 ACP ZIP 安装可能在压缩条目完成之前停住。Issue #1185 将故障定位到使用 yauzl 2.10.0 的现有解压器。CLI 升级到 yauzl 3.4.0，由其内置 reader 实现原生 stream 销毁生命周期，同时保留解压器的取消和 reader 关闭屏障。在现有测试中增加确定性的 8 MiB 压缩条目，验证完整内容和归档末尾条目。本地未验证报告中的 Linux 环境或完整发布版 CLI。

## 决策与证据

[Issue #1185](https://github.com/LodyAI/Lody/issues/1185) 报告：Node 24.16 将 8,388,608 字节输入解压到 8,386,048 字节后停住，Node 22.22.3 则正常完成。[yauzl #170](https://github.com/thejoshwolfe/yauzl/pull/170) 将 reader 的销毁改为 `_destroy` 实现，不再覆盖公开的 stream `destroy` 方法。采用上游维护的实现，不修改 Node 内部状态，也不添加解压超时。运行时下载通道、路径边界检查和独立消费者取消语义均不改变。

现有可取消 relay 继续作为消费者边界，reader 的 close/error 继续作为临时目录清理屏障。完成性回归扩展现有 ZIP 测试；取消、写入失败、reader 关闭失败和路径拒绝仍由该套件覆盖。修改后的现有套件在 macOS arm64、Node 22.16、Node 24.12 和 Node 24.16、yauzl 3.4.0 下均通过七项测试。在同一实际 Node 24.16 环境中，yauzl 2.10.0 的压缩条目完成测试在 30 秒后超时（另外六项测试通过），而 yauzl 3.4.0 在 3.38 秒内通过全部七项。相同套件在 Node 24.12、yauzl 2.10.0 下也通过；24.12 的对比证明兼容性，24.16 的对比证明故障及修复。最初对 8 MiB Buffer 做深度相等比较的开销过大，所得超时不作为故障证据；改用长度和 SHA-256 比较。贡献说明记录完整检查结果；Node 24.16 Linux 和打包的 ACP 安装仍是验证限制。
