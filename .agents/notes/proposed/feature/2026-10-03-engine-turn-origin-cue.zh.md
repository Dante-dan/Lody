# 在助手行内显示引擎轮次来源

Status: proposed
Translation: current

[English](2026-10-03-engine-turn-origin-cue.md)

## 摘要

引擎主动开启的助手轮次需要说明出现原因，同时不能使后续导航目标偏移。本参考改动只读取持久化的 `cron_job` 和 `task` 来源，在助手现有首行内显示本地化标签。它不增加流条目或虚拟行，也不显示触发提示词。参考实现依赖尚未合并的 PR #654 历史契约；当前 main 没有持久化来源字段，因此本改动不是兼容 main 的运行时交付。

## 决策与边界

[Issue #660](https://github.com/LodyAI/Lody/issues/660) 记录了被撤回的分隔条：插入流条目会改变历史与聊天索引的对应关系。[PR #654](https://github.com/LodyAI/Lody/pull/654) 已撤回该 UI，并提出持久化 `acpTurnOrigin`。本分支保留原作者的提交作为依赖，只修改 UI 消费方，不重新实现引擎路由，也不代表该契约已被采用。

已知来源显示“定时任务”或“后台任务”，未知或缺失来源不显示标签。首行标记随现有展开/折叠布局变化，使标签只出现一次且不增加虚拟行。历史条目可能原地更新，因此流缓存比较持久化来源。重新加载仍读取同一字段，不根据相邻用户轮次推断。[Spec](../../../../specs/engine-turn-origin-affordance.zh.md) 保持 draft。

## 证据与验证

main `5a0729be9d728dc6a1be34e9b20f975a453e3e23` 的历史 schema、历史应用、会话领域和流构造器均没有 `acpTurnOrigin`。参考基线 #654 为 `0a98b773b2be35ef5f529fa8c8e6d4d65de25e37`；其写入 schema 接受可选字符串，流构造器将字段传给消息。现有流和行测试扩展覆盖两个引擎轮次后的用户索引、重载来源、原地修改时缓存失效，以及不变的行 key/索引。两套现有测试共 32 项通过，包含本地化标签渲染。相关 lint 无错误，i18n 与 docs 检查通过。恢复参考基线的子模块版本后，全库 format 通过。没有运行桌面应用或实际 provider 产生的引擎历史；测试使用仓库 fixture。components typecheck（`tsgo --noEmit`）也通过。全库 `pnpm check` 已尝试，但 adapter 准备未完成并取消；不声称全套检查通过。Storybook 展示已知、缺失和未知来源。
