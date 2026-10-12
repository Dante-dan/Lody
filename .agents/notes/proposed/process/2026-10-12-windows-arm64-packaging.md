# Explicit Windows ARM64 installer entry point

Status: proposed
Translation: current

[中文](2026-10-12-windows-arm64-packaging.zh.md)

## Abstract

A Snapdragon X user requests a native Windows ARM64 installer to avoid x64
emulation costs. Add an explicit ARM64 NSIS build command using the existing
packaging wrapper and target-specific native staging, leaving the generic Windows
command unchanged. The source already models Windows ARM64 for its native
bindings; selecting that target is separate from proving a working release.
Native Windows ARM64 packaging probes and device testing remain unperformed.

## Decision and evidence

[Issue #1494](https://github.com/LodyAI/Lody/issues/1494) prioritizes Windows ARM64;
Linux ARM64 is optional and outside this change. `build:win:arm64` builds the same
local OSS composition as `build:win`, then selects `--win nsis --arm64` through
`apps/electron/scripts/package-electron.mjs`. The wrapper retains its publish-never
default. No release automation, signing credentials, updater channel, or existing
architecture default changes.

The lockfile pins Electron 44.7.0, better-sqlite3 13.0.3,
@lydell/node-pty 1.2.0-beta.14, @loro-dev/roost-node 0.1.2 and
@napi-rs/keyring 2.1.0. Roost, node-pty and keyring have exact-version Windows
ARM64 optional packages recorded there. The official
[Electron 44.7.0 release](https://github.com/electron/electron/releases/tag/v44.7.0)
includes `electron-v44.7.0-win32-arm64.zip`. `cli-native-deps.mjs` selects bindings by
packaging target, including Windows ARM64; its existing tests cover that target.
Availability of a package declaration does not prove successful native loading.

Automatically adding ARM64 to every generic Windows build would change existing
build output and cost. An explicit command lets maintainers opt into the target
while keeping existing behavior. Publishing installers belongs to the release
operator: the public `release.yml` only synchronizes versions and creates a
changelog-only release.

## Acceptance and validation limits

On a Windows ARM64 host, run `pnpm --dir apps/electron build:win:arm64` and require
its after-pack embedded CLI, ConPTY, SQLite and Roost probes to pass.
Then test installer installation/uninstallation, renderer startup, terminal use,
local session persistence, keyring-backed credential storage and update metadata on Snapdragon hardware. Cross-host
packaging deliberately skips runtime probes and cannot establish these outcomes.
This note records a reference contribution, not a supported-release announcement.

Local verification on macOS ARM64 passed the existing native-dependency and
Sparkle packaging suites (9 tests), `pnpm format`, and documentation checks. The
native-dependency suite exercises Windows ARM64 target staging with fixtures;
its real native runtime execution uses the macOS host binding. None of those
results establishes Windows ARM64 runtime support. No dependency version changes
are made, so the manifest script addition does not change the lockfile graph.
