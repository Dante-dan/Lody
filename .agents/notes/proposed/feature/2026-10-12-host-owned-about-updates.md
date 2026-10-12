# Host-owned About updates

Status: proposed
Translation: current

[中文](2026-10-12-host-owned-about-updates.zh.md)

## Abstract

APK users currently leave the app to find an official update. A small optional public host port lets shared About UI display update status and invoke user actions while the host retains release lookup, downloads and installation. The same port serves narrow and wide About version rows; existing Electron IPC remains unchanged. This is a reference implementation for #1486, not an Android downloader or evidence of native integration.

## Decision and evidence

Use the same pre-mount optional-host capability pattern as app icon selection, with the existing platform `ReadonlyStore` as the snapshot contract. Missing capability hides the control; mounting never checks or polls. Host-selected action kinds allow download, install, external update-page opening and retry without exposing native paths or release URLs. Rejected commands show a generic retryable error and preserve the failed operation for retry.

This is an ordinary shared feature/implementation boundary, without a new security, ownership, durability or compatibility guarantee requiring a Spec. No Spec is marked approved and no human review is claimed. The existing [app icon decision](../../implemented/feature/2026-09-20-app-icon-selection.md) supplies the adjacent host-capability precedent.

Six synthetic React tests passed across narrow and wide rows: live versions/status, manual commands, absent capability, progress and retry. The platform contract typecheck passed; Storybook covers meaningful snapshots. Native APK lookup/download/install and physical-device validation remain in the external host repository. Full checks and actual outcomes are recorded with delivery evidence, not implied by this proposal.

Issue: https://github.com/LodyAI/Lody/issues/1486
