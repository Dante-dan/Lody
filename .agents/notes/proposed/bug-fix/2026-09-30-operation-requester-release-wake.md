# Operation completion at requester Turn release

Status: proposed
Translation: current

[中文](2026-09-30-operation-requester-release-wake.zh.md)

## Abstract

A pending Operation completion can remain undelivered after its requester Turn ends because document notifications occur while execution still owns that Turn (#1170). The proposed coordinator change registers one exact-Turn release barrier per requester and wakes reconciliation when execution actually releases ownership. Pending user dispatch remains higher priority, and coordinator stop invalidates old callbacks. The change uses the existing race-safe execution barrier rather than a polling timer or an additional history scan.

## Decision and evidence

`deliverIfRunnable` correctly refused a busy requester but owned no later wake. `SessionExecutionService.waitForTurnRelease` rechecks ownership after registering its waiter, so release between observation and subscription is safe. Coalesce repeated hints for the same Turn; a newer Turn replaces the callback token. Stop clears tokens before a later callback can open a store or dispatch work, including stop/restart of the same coordinator.

```text
pending Delivery + active requester Turn -> register exact release barrier -> return
execution releases Turn -> validate owned callback -> reconcile current durable state
pending user dispatch -> defer Delivery; otherwise existing fenced Delivery path
```

This preserves the existing completion protocol and its user-priority guarantee. The separate pre-provider settlement bug (#1171) is not included. The reduced Operation model owns a release wake while busy and explores its transition after release. The coordinator suite passed (80 tests) and executable model passed (17 tests), including release-only wake, user priority and stop invalidation. Root formatting and documentation checks passed. Root `pnpm check` stopped at the Devin adapter build because its Node/core dependencies are not installed; later root checks did not run; no upstream approval or live provider/desktop reproduction is claimed.
