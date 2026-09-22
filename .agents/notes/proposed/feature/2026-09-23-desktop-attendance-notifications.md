# Suppress mobile push while desktop is attended

Status: proposed
Translation: current

[中文](2026-09-23-desktop-attendance-notifications.zh.md)

## Abstract

Completion and permission notifications currently reach a user's phone even while
that user is actively working in the desktop application. The proposal adds one
bounded, workspace-scoped desktop-attendance fact and lets the hosted sender consult
it at delivery time. It deliberately fails open to mobile push and does not use
machine liveness, session visibility alone, or per-input presence writes. The public
producer and hosted consumer remain unimplemented until the linked Spec revision is
explicitly approved.

## Proposed responsibilities

- The renderer observes visibility, focus, and discrete input, retaining only the
  latest attended timestamp locally.
- One fixed-size `desktop-attendance` presence entry is keyed by user and ephemeral
  application instance. It is written on the active edge and no faster than the
  existing 30-second heartbeat.
- The hosted sender checks attendance at send time and skips only that user's mobile
  devices while the latest attended timestamp is under 60 seconds old.
- `CloudNotificationsPort` keeps carrying notification facts rather than a stale
  attendance snapshot. Desktop-native banners keep their current local check.

## Evidence and alternatives

`session-viewing` already proves the renderer can publish a bounded UI-originated
presence value, but it is session-specific and reacts only to document visibility.
Reusing it directly was rejected: viewing a session does not prove recent input or
window focus, and it would couple notification policy to PR-poller scheduling.

Machine presence was rejected because a live agent host says nothing about whether a
person is looking at the desktop. Passing an `attended` boolean in each CLI notification
call was also rejected: the CLI does not own renderer interaction state, and the value
can become stale before the hosted sender resolves devices. Writing on every input was
rejected because the shared ephemeral queue is a bounded liveness budget.

The missing hosted OneSignal source is an explicit boundary, not a reason to move that
implementation into OSS. The public contract can define the fact and its conservative
failure behavior; hosted adoption remains a separate implementation responsibility.

## Verification and limits

This round inspected the current issue, presence schema and renderer publisher,
desktop notification focus check, notification port, and active presence Spec. No
runtime code was changed and no behavioral test was run. The repository document
command could not run in the isolated environment because its Node/pnpm toolchain was
unavailable; link and metadata checks remain required before a PR.

Proposed intent: [desktop attendance Spec](../../../../specs/desktop-attendance-notifications.md).
Requirement: [Issue #527](https://github.com/LodyAI/Lody/issues/527).
