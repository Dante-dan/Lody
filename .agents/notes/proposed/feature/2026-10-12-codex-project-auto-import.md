# Opt-in Codex project history import

Status: proposed
Type: feature
Translation: current
Issue: [#1396](https://github.com/LodyAI/Lody/issues/1396)

[中文](2026-10-12-codex-project-auto-import.zh.md)

## Abstract

Codex Desktop users want existing chats to appear in Lody without selecting each conversation manually. This reference implementation adds a default-off preference for a registered local project and its selected native Codex Provider. Opening that project's conversation list, making it visible again, or manually syncing lists the Provider's project-scoped catalog and imports newly available chats through the existing read-only importer. It preserves existing imports and conflicts, and does not discover another account, scan a global home, or run a background watcher. Real Codex Desktop data discovery remains unverified.

## Evidence and scope

The existing UI separates catalog Sync from importing selected IDs. The Codex adapter already includes `appServer` among `thread/list.sourceKinds`, but filters by the requested project directory and selected model Provider. Including this source is code evidence, not proof that every Desktop conversation is visible in the selected native home.

Managed Codex profiles deliberately omit global history and native session databases ([profile intent](../../../../specs/codex-account-profiles.md)). The switch is therefore offered only in Electron for a local machine and an explicitly selected builtin Codex configuration without `codexAuth`. It is absent for remote targets, managed profiles, legacy requests without a selected configuration, and other agents. The native catalog does not establish an account ID for filtering; changing login outside Lody is not proven to isolate history within one unmanaged Provider. This preserves the existing data ownership and read-only replay boundaries; it does not introduce a new data source, ownership guarantee or durability protocol requiring a new Spec.

## Decision

The renderer stores consent under user, workspace, machine, local project and Provider ID. No consent is sent to shared project metadata. The preference belongs to the renderer and survives reopening the conversation list; it is not a daemon schedule. Only the currently displayed Provider's list triggers automatic work.

Catalog reads still use the selected Provider and project. Only entries marked available (including legacy entries with no status) are selected. Stable import IDs, durable history/cursors, account bindings and conflict detection remain owned by the existing machine importer. Already imported sessions keep their on-open refresh behavior. Conflicts require the existing explicit replacement action.

A single settings owner admits one history operation per project/Provider. Opt-out, leaving the conversation list, disposing settings, changing user/workspace, removing the project or losing the selected native configuration stops further automatic batch admission. An admitted batch can finish; already durable imports are retained. Failures use the existing error and per-batch result surfaces. Returning to the list or syncing explicitly provides another attempt; no polling timer or unattended retry is added.

## Validation and limits

The existing control-client suite covers available-only imports, retained conflicts/imports, explicit local native Provider admission, rejection of managed/remote/ambiguous Providers and opt-out between bounded batches. The existing panel suite exercises default-off behavior and cancellation of a pending read after opt-out. The ProjectSettings Storybook includes a synthetic interactive import state.

The 12 focused tests, affected package typecheck, root workspace typechecks, corrected type-aware lint, formatting, documentation and boundary checks pass. The full CI test command was interrupted after existing CLI fixtures attempted sandbox-denied writes to the real user data directory; two UI tests that timed out in that run pass in isolated reruns on the reference tree. This is not a passing full-suite result or a baseline comparison. The tested revision is recorded with the public reference delivery. No real account, private transcript, Desktop import, remote machine, background synchronization, arbitrary project reassignment or newly created data source was exercised. This is a first slice for #1396, not a claim that the entire automatic synchronization request is resolved.
