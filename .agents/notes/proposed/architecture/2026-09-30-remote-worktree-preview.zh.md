# 远程 worktree 预览授权

Status: proposed
Translation: current

[English](2026-09-30-remote-worktree-preview.md)

## 摘要

绑定主 checkout 的远程会话不能预览指向同仓库兄弟 worktree 的绝对路径。当前包含关系检查有意拒绝这个目标；PR #892 的同机 Electron 修复不授予远程读取权限。宿主操作者可以通过现有环境变量显式允许一个精确的 worktree 根，但该许可作用于整台 daemon，而不是某个会话。未来的会话级授权应由文件所在机器上的明确用户动作建立，保留规范路径和只读状态，并支持撤销；本记录提出边界，不实现或批准新的权限。

## 当前证据

Issue [#472](https://github.com/LodyAI/Lody/issues/472) 描述桌面查看另一台机器上的会话。报告中的已安装版本路径实验仅在使用目标 worktree 根时接受文件。这是报告者证据，本次没有进行端到端重放。

检查的 main 为 `8304ae9e5a4b1125b81500d391228aaae48243e5`。[路径政策](../../../../apps/cli/src/lib/file-preview/file-preview-path-policy.ts) 将 `LODY_FILE_PREVIEW_EXTRA_ROOTS`（用平台路径分隔符分隔）加入会话根、系统临时目录和聊天目录。授权比较解析符号链接后的目标和根；缺失路径分类不授予读取。[message-handler.ts](../../../../apps/cli/src/lib/message-handler.ts) 向预览服务传入会话 owner 的工作区。Git 仓库归属不增加允许根。

宿主操作者可在启动 daemon 时设置 `LODY_FILE_PREVIEW_EXTRA_ROOTS=/home/example/projects/sample-repo-worktrees/topic-branch`。该目录下的远程预览对这台 daemon 服务的会话生效，不是会话级权限。应选可信的精确根，不应设置包含无关 worktree 或私有文件的父目录。预览保留 external/只读标志，不授予写权限。这是现有受限选项，未完整实现作者要求的会话关联。

已合并的 [PR #892](https://github.com/LodyAI/Lody/pull/892) 保留同机 Electron 目标；其[记录](../../implemented/bug-fix/2026-09-22-local-conversation-file-paths.zh.md) 明确保持远程授权不变。不能将本机任意文件能力导出到远程 RPC。

## 建议的会话级边界

文件所在机器上的明确用户动作，应将授权绑定到已验证的会话 owner 和一个规范 worktree 根。Agent Markdown、shell cwd 和 Git worktree 列表只是事实，不是权限。仓库关联检查可在授权后验证关系，不能自动允许全部兄弟 worktree。

Daemon 每次远程预览都检查当前授权，解析符号链接并进行精确包含关系检查。授权删除或撤销后默认拒绝；同一路径被其他 worktree 重用不能静默继承许可。外部文件只读，绝对路径保留分支文件身份。预览仍不得激活 Code Collab。存储、操作者验证和传播/撤销契约需要明确的 draft Spec，只有该版本获关联的人工批准后才能视为已批准意图。

## 其他方案与限制

把新会话直接绑定 worktree 可用现有工作区边界，但不能满足原会话链接。环境变量可服务原会话，权限却作用于整台 daemon。自动信任仓库归属或导入 Electron 任意文件能力会无授权地扩大读取范围，不采用。

本次仅静态检查代码与契约，没有远程 UI 重放、新实现、授权生命周期测试或人工批准。下一步先由维护者明确支持的会话关联与授权主体，再引入存储或协议契约。

## 草案契约补充

现已补充[Spec 草案](../../../../specs/remote-worktree-preview.zh.md)，记录会话/所有者绑定、规范路径包含、撤销/替换/重启结果及验收到测试的映射。存储、主机确认与协议表示仍是明确待评审问题。这补齐了缺失的草案阶段；本提案记录及翻译后的草案均不代表人工批准。运行时实现尚未开始。


## 可执行参考接入点（2026-10-03）

`FilePreviewSessionGrants` 作为可选依赖接入真实预览服务。可信主机适配器必须认证当前会话 owner、用户 principal 和授权代际，并由主机用户明确确认该规范化 worktree 根。现有 `MessageHandler.assertOwner` 只检查会话作用域，不能认证授权签发者。生产 daemon 未构造该 registry，也没有新增 grant RPC。主机确认、仓库归属核验与客户端协商仍需集成，因此不声称端到端修复。

参考代码按请求会话在内存保存单一根，重启为空。设备号、inode、birthtime 绑定替换身份；无法提供可靠身份的文件系统拒绝授权。预览在解析前与读取/编码完成后检查实时授权，包含 digest 未变化响应。确认过程中撤销不会恢复旧授权；owner、principal、代际变化或根被替换均拒绝访问。原有远端大小限制、规范路径校验、只读响应和同机 Electron 行为保持各自边界。

现有 service 测试新增确定性文件系统/认证生命周期场景：分支内容、未授权第二会话、父目录与逃逸 symlink 拒绝、owner 改变、重启、路径复用和响应期间撤销。这是参考代码及所属测试验证，不是实际主机认证集成或远程 UI QA。提案意图与 Spec 仍未获批准。

## 失效授权不得复活

注册表在读取观察到所有者、用户身份、授权代次、认证或目录身份失效时永久撤销该授权。身份恢复不能重新启用旧授权，必须再次明确主机确认。撤销推进会话代次，阻止等待中的确认重新安装权限。异步旧读取只撤销它观察到的同一授权，不删除后来新确认的授权。现有服务测试覆盖身份和授权代次恢复后仍拒绝访问、重新确认后恢复。生产启用仍是独立工作。
