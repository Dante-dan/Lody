# Local project Apple target hints

Status: draft
Translation: current

[中文](local-project-apple-targets.zh.md)

A Mac user opens both an iOS application and an ordinary backend project. Clients
may emphasize the iOS Simulator tool for the application without treating the
backend as incapable of using it. The daemon owns discovery so each client does
not need a separate filesystem RPC or marker list.

## Contract

Local project metadata may contain `appleTargets`, an array of `{ kind, path }`.
Kinds are `xcode`, `swiftpm`, `expo`, `flutter`, or `other`; paths are relative to
the registered root. These are best-effort hints for ordering/emphasis only,
never permission to access a path or select a scheme. Missing or empty hints
preserve the existing Darwin plus iOS Simulator capability behavior.

The daemon detects on registration and root changes. Ordinary metadata updates
retain previously discovered hints. It inspects the root and two child levels,
plus an `ios` directory immediately below that boundary for `apps/<name>/ios`.
Traversal excludes dependency/build/hidden directories and directory symlinks,
and has explicit directory, entry, marker-read, and result limits. Unreadable
paths and malformed markers produce missed hints, not registration failures.

This implementation recognizes Xcode project/workspace directories, `Package.swift`,
Expo dependencies in `package.json`, and Flutter SDK dependencies in `pubspec.yaml`.
Marker presence is not proof that a scheme can build for iOS. KMP, XcodeGen,
automatic discovery after in-place edits, and scheme/path preselection remain
outside this first contribution. The `other` kind is reserved for future producers.

## Compatibility

The optional field travels through the existing Machine Flock local-project row.
Readers keep known valid hints and ignore malformed or unknown hint entries
without discarding the project. Older daemons do not need to populate the field;
clients must continue to offer the simulator based on machine capability.
No new RPC, polling loop, or cloud request is introduced.

## Evidence

- [Issue #1233](https://github.com/LodyAI/Lody/issues/1233)
- [Implementation decision](../.agents/notes/proposed/feature/2026-10-03-local-project-apple-targets.md)
- `apps/cli/src/lib/local-project-meta.ts` and its owning test suite
- `packages/shared/src/machine-flock.ts` and its owning test suite
