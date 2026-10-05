# 会话置顶的持久排序

Status: draft
Translation: current

[English](session-pin-order.md)

用户置顶两个会话后，希望新消息与客户端重启不改变置顶顺序。
共享契约提议在 `SessionMeta.isPinned` 旁新增可选 `pinnedAt`，单位为 epoch 毫秒。
从未置顶变为置顶时记录调用方时钟；重复置顶保留排序。
取消置顶保留元数据，再次置顶使用新的时间戳。

置顶项按置顶时间倒序排列，同时间以会话 ID 排序。
旧数据缺少有效时间戳时排在有时间戳的数据之后，按 ID 排序。
打开文档不迁移旧数据；未置顶项保持原有消息活动排序。
旧客户端仍可能按消息时间排序，只有其消费层完成适配后才获得新保证。

公开桌面端的置顶操作通过现有元数据 writer 写入状态转换时间戳。元数据缓存与
聊天、GitHub 和本地项目行投影将时间戳传给平面排序和 opened-by 根组排序；
根组以最近置顶转换排序，因此子会话的新消息不会移动置顶组。共享移动布局的行投影
与 `groupChats` 使用同一比较器与根组排序。原生 iOS Inbox、拖动排序及私有客户端
实现仍不在公开补丁范围内。时钟偏差可能影响新置顶的相对位置，方案不保证离线节点间
的因果全序。本修订仍等待人工批准。

## 证据

- [需求与消费层](https://github.com/LodyAI/Lody/issues/782)。
- [参考状态转换及比较](../packages/shared/src/session-pin.ts)。
- [行为检查](../packages/shared/tests/session-pin.test.ts)。
