# Desktop attendance and mobile notifications

Status: draft
Translation: current

English | [中文](desktop-attendance-notifications.zh.md)

When the same user is actively attending Lody on desktop, completion and permission
push notifications to that user's phones are redundant. The desktop publishes a
workspace-scoped, short-lived attendance fact; the hosted notification sender uses
that fact at send time to skip mobile delivery. Once the desktop has been inactive
for 60 seconds, mobile delivery resumes. Desktop-native notifications retain their
existing foreground check.

## Attendance

A desktop application instance is attended only while all of these are true:

- its document is visible;
- its window has focus; and
- a qualifying user interaction occurred within the previous 60 seconds.

Qualifying interactions are discrete keyboard, pointer, or touch actions. Pointer
movement, animation frames, rendering, network activity, agent output, and machine
liveness are not user attendance. Focus or visibility without recent interaction is
also insufficient.

The 60-second window starts from the latest qualifying interaction observed while
the document is visible and focused. Blur and hide stop extending the window; they do
not convert machine liveness into attendance. The publisher clears an expired entry
and also tolerates its loss or expiry in transport.

## Presence contract

The renderer publishes one `desktop-attendance` entry per authenticated user and
desktop application instance in the workspace presence channel. The fixed-shape
entry contains only the user id, an ephemeral instance id, the latest attended-at
timestamp, and the publication timestamp. It contains no session text, input content,
device fingerprint, or interaction history.

The publisher may write immediately when attendance becomes active, then refresh at
most once per existing 30-second presence heartbeat. Raw input events update local
state only; they never produce one presence write per event. The entry uses a stable
key and replaces its prior value, so readers need only the latest state. These bounds
are part of the shared [ephemeral presence budget](loro-ephemeral-presence-channel.md).

An entry suppresses mobile delivery only when its attended-at timestamp is within the
60-second window and the entry itself is fresh. A malformed, absent, expired, or
unavailable presence snapshot never suppresses a push. This fail-open behavior keeps
phone-only use and notification delivery during connectivity failures unchanged.

## Delivery responsibility

The public desktop owns attendance observation and publication. The hosted
notification sender owns the final recipient decision because it has the freshest
workspace presence and device list when a notification is sent. The CLI continues to
report session completion and permission requests through `CloudNotificationsPort`;
it does not snapshot attendance into those calls, and the local-only composition
still has no cloud notification capability.

For one notification event, a fresh attendance entry for the target user suppresses
mobile push to that user's devices only. It does not suppress another user's devices,
persist an inbox decision, end Live Activity, or change the underlying completion or
permission record. Multiple attended desktop instances have OR semantics: any one
fresh instance is sufficient.

Desktop-native completion and permission banners keep their existing local focus and
visibility behavior. This contract does not use online Machine presence as a proxy,
does not require the phone application to be closed, and does not move hosted
OneSignal implementation into the public repository.

## Evidence and approval

The current session-specific visibility signal is published by
[`use-publish-session-viewing.ts`](../packages/components/src/hooks/use-publish-session-viewing.ts)
through
[`workspace-presence-transport.ts`](../packages/components/src/providers/workspace-presence-transport.ts).
Presence shapes and freshness live in
[`packages/shared/src/presence.ts`](../packages/shared/src/presence.ts), while the
notification boundary is
[`CloudNotificationsPort`](../packages/platform/src/cloud-port.ts).

Requirement: [Issue #527](https://github.com/LodyAI/Lody/issues/527).
This draft defines proposed intent. No attendance producer or hosted suppression is
approved or implemented by this document; implementation requires explicit human
approval of this revision.
