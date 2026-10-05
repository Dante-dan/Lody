# Shared durable session pin ordering reference

Status: proposed
Translation: current

[中文](2026-10-05-durable-session-pin-order.zh.md)

## Abstract

Issue #782 identifies message activity as an unstable ordering source for pinned
conversations. This proposal records a pin-transition timestamp in shared metadata
and offers a deterministic comparator, without migrating stored sessions on read.
The reference patch covers the contract and behavior checks, not consumer integration.
Timestamp order is simpler than manual rank but is affected by peer clock skew.

## Decision and limits

Use the issue's explicitly acceptable `pinnedAt` alternative. A repeated pin is
idempotent, while a repin receives a fresh rank. Legacy pins use session id rather
than activity or mutable title so message updates cannot reorder them. Ordered-ID
lists and fractional ranks could support manual reorder but add conflict-resolution
and list ownership decisions beyond this first reference.

Public desktop consumers `sortUpdatedItems` and session-list tree ranking must
adopt this comparator together with their metadata projection. Mobile consumers
and the external Inbox require their own adapters; this patch changes none of them.
A draft [Spec](../../../../specs/session-pin-order.md) records the proposed guarantees.
No human approval or complete issue resolution is claimed.

## Verification

The owning shared Vitest tests exercise activity changes, repeated pins, repins,
and legacy fallback. Actual execution results belong to the contribution report;
the proposal remains subject to review and consumer integration.
