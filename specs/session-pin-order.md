# Durable session pin ordering

Status: draft
Translation: current

[中文](session-pin-order.zh.md)

A user pins two conversations and expects their order to survive new messages and
client restarts. The proposed shared contract adds optional `SessionMeta.pinnedAt`
(epoch milliseconds) alongside `isPinned`. New pin transitions record the caller's
clock; repeating a pin request preserves its rank. Unpinning preserves metadata,
but repinning records a fresh timestamp.

Pinned rows compare newest pin first, with session id breaking equal timestamps.
Legacy pins lacking a valid timestamp follow timestamped pins, ordered by id.
Opening a document never migrates legacy pins. Ordinary unpinned rows retain their
existing message-activity ordering. Mixed older clients may still use message
activity and do not acquire this guarantee until their consumers are adapted.

The public desktop pin action writes the transition timestamp through its existing
metadata writer. Metadata caches and chat, GitHub, and local-project row projections
carry the rank into both flat sorting and opened-by group ranking. Group rank uses
the freshest pin transition, so messages in an opened conversation cannot reorder
pinned groups. Mobile, manual drag ordering, and private client implementation
remain outside this patch.
Wall-clock skew can affect a new pin's relative rank; this proposal deliberately
avoids claiming a total causal order across offline peers. Human approval of this
revision remains pending.

## Evidence

- [Request and consumers](https://github.com/LodyAI/Lody/issues/782).
- [Reference transitions and comparison](../packages/shared/src/session-pin.ts).
- [Behavior checks](../packages/shared/tests/session-pin.test.ts).
