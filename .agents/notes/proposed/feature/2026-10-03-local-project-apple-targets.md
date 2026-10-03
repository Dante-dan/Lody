# Daemon-owned Apple target hints

Status: proposed
Translation: current

[中文](2026-10-03-local-project-apple-targets.zh.md)

## Abstract

Clients currently need their own filesystem probes to distinguish iOS projects
from ordinary Mac projects. This proposal publishes bounded, optional hints in
the daemon-owned local-project catalog. It preserves tool availability and the
existing local-first sync path. Marker detection may miss large/deep projects
or identify a Swift package that cannot build for iOS; hints are not capabilities.

## Decision and alternatives

Use the existing Machine Flock row rather than another RPC or client-side scanner.
The daemon detects at canonical-root registration/change and caches even empty
results, avoiding filesystem work on history/display updates. Scanning every
update would discover in-place edits sooner but adds repeated work to unrelated
metadata writes; that refresh policy is deferred.

The scan reads at most 64 directories, 256 entries per directory, 64 KiB per
manifest, and 32 hints. It skips symlinks and dependency/build/hidden trees.
Two general child levels plus a final `ios` directory cover the issue's monorepo
example without unlimited recursion. Unreadable/malformed markers fail open.

```text
project registration/root change
  -> bounded local discovery
  -> optional appleTargets in Machine Flock row
  -> shared decoder validates known hints, retains the project
  -> clients may rank tools; existing capability availability stays unchanged
```

## Scope and evidence

Xcode, SwiftPM, Expo and Flutter markers are implemented. KMP/XcodeGen and
scheme preselection are deferred; the schema reserves `other` without inventing
heuristics. Existing client availability code remains unchanged, preserving
the old-CLI behavior. The owning tests exercise disk discovery, root-change
publication, ordinary projects, and mixed-version metadata decoding.

The [Spec](../../../../specs/local-project-apple-targets.md) remains draft, and
this decision remains proposed pending upstream review. Validation results are
reported with the contribution; tests do not imply human approval.

Source: [Issue #1233](https://github.com/LodyAI/Lody/issues/1233).

Related decisions: [simulator panel](../../implemented/architecture/2026-09-27-ios-simulator-panel.md)
owns tool availability/lifecycle; [sidebar ordering](../../implemented/feature/2026-09-20-local-project-sidebar-ordering.md)
owns personal project rank. These hints change neither responsibility.
