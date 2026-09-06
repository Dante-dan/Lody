# 本地仓库 IndexedDB 写满或失效时失败关闭

Status: proposed
Translation: current

[English](2026-09-06-storage-crisis-fail-closed.md) | 中文

## 摘要

用户磁盘写满后，渲染进程的 CRDT 副本先遇到 `QuotaExceededError`，随后 IndexedDB 连接进入
永久关闭状态，于是每次新建会话都失败并在 toast 里抛出裸露的 Chromium DOMException；即使用户
腾出了空间，toast 仍然不断出现，因为只有重启进程才能重新打开该连接。我们在传给
`LoroRepo.create` 的存储适配器外面包一层做错误分类，锁存一个单向熔断器，并用一块阻塞式恢复
界面取代反复弹出的 toast，其操作是重启应用。读操作和写操作一起失败关闭，这是关键取舍：返回
`undefined` 会被上层读成"该文档不存在"，从而让下一次写在持久数据之上另起一段历史。分类器目前
仍以 DOMException 消息文本作为兜底匹配，这是启发式而非稳定契约；要去掉它取决于尚未完成的
上游改动。

## 问题

见 [Lody #417](https://github.com/LodyAI/Lody/issues/417)。新建会话显示"会话创建失败"，正文是
`Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.`，
每重试一次就多叠一条。应用里没有任何操作能成功，也没有任何地方说明这一点。

有两个发现决定了修法。其一，`IndexedDBStorageAdaptor.loadDoc` 即使面对一个什么都不会写的全新
room，也开 `readwrite` 事务，因此会话创建是在**读路径**上就断了，根本没走到写——在输入框那层
加防护只能覆盖众多调用方中的一个。其二，濒死的连接绑定在渲染进程上，所以腾出磁盘空间和刷新
页面都无法恢复它。

## 决策与发现

熔断器放在仓库层之下，即 `createCrisisAwareStorageAdapter` 内，而不是各个调用点：归档、发送、
工作区目录写入撞上的是与会话创建同一条死连接。它把每个被分类的失败重新抛为
`StorageCrisisError`，因此即便是第一次失败，原始引擎文案也到不了 toast。机制说明见
[storage crisis](../../../docs/components-storage-crisis.md)（英文）。

我们核实过 loro-repo 在 save 失败时不会丢数据：`persistDocUpdate` 会把 `docPersistedVersions`
回滚并把文档重新入队，`MetaPersister` 也只在 `save()` 成功之后才推进 `lastPersistedVersion`。
所以这是一个失败表现的正确性与体验问题，不是持久性缺陷。

### 考虑过的替代方案

**内存版仓库兜底**，照搬 `ResilientRemoteCursorStore`。否决：那个 store 之所以能安全降级，是
因为 Streams cursor 只是可由服务端重建的回放检查点。仓库文档是用户数据，内存替身会接受它永远
无法持久化的写入，并在无可避免的重启中丢掉。

**读返回 `undefined`、只让写失败。** 按摘要中的理由否决：这会把一个可见的失败变成静默的数据
丢失。

**在 `InvalidStateError` 时自动重开**（`db.close()`、清掉缓存的 promise、重试一次），issue 里
列为可选项。否决：磁盘满时重开大概率同样失败，而会自愈的存储层会让应用更难失败关闭。粘性分类
加上显式重启是更清晰的契约。

**改 `patches/loro-repo.patch`** 在库内做分类，这是 issue 出于速度考虑建议的做法。否决：
`StorageAdapter` 是公开接口且所有方法都是 `async`，因此裸的同步 `db.transaction()` 抛出本来就
会以 rejection 的形式被包装层看到。对已发布的 `dist/`（两份构建）打补丁需要在每次版本升级时
重打，而当前没有任何用户可见收益。

### 已知限制

`classifyStorageFailure` 优先匹配 DOMException 的 `name`，但会回退到消息正则，而这些文案跨引擎、
跨语言环境都不是稳定 API。已向 `loro-dev/loro-repo` 发起上游工作，给存储错误附加稳定的 `code`，
并让 `loadDoc` 不再需要 `readwrite`；上游落地后，正则兜底可以只保留作旧版本兼容。在那之前，
措辞不同的引擎消息会被当作未分类——这是安全侧的失败，应用保持原有行为，而不会错误地锁存。

## 验证

3208 个 components 测试（新增 27 个，覆盖分类、cause 链遍历、读失败关闭，以及恢复界面的操作），
79 个 Electron 测试，typecheck、lint、i18n，以及 public/platform/code-collab 边界守卫。磁盘满
这一条件是用 fixture 复现的，而非真实写满的卷；没有在耗尽磁盘的机器上做端到端手工验证。
