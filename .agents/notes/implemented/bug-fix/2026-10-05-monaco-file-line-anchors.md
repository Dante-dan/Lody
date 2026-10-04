# Preserve file-link anchors during Monaco initialization

Status: implemented
Translation: current

[中文](./2026-10-05-monaco-file-line-anchors.zh.md)

## Abstract

A first file-link click could leave a long wrapped file at its beginning, and the requested lines had no visible highlight. The controller now records the target in Monaco's cursor state before an immediate reveal, so language initialization and wrapped layout preserve the anchor. Line decorations use Monaco's theme-aware `rangeHighlight` instead of undefined application classes. This repairs navigation without a retry timer or file-access change; packaged desktop validation is separate from the synthetic browser regression.

## Decision and evidence

[Issue #1253](https://github.com/LodyAI/Lody/issues/1253) reports Desktop 0.103.0 on macOS and a 6,600-line controller reproduction. The previous controller revealed the target with smooth scrolling but kept the cursor at line 1; later language setup and wrapped layout could preserve that cursor instead. Its two decoration classes had no CSS definitions.

Set the cursor to the normalized start line, then reveal it with `ScrollType.Immediate`. Keep the existing normalized whole-line range and use the built-in `rangeHighlight` class, whose background follows Monaco's theme. Do not introduce deferred scroll retries that would fight later user navigation. Existing cursor callbacks continue to report the actual local position; changing or clearing the range still updates decorations through their existing owner.

## Verification and limits

The owning Code Collab Storybook and Playwright suite includes a synthetic 6,600-line TypeScript file, cold narrow viewer, language loading, expansion, visible themed highlight, and repeat navigation. Components typecheck, formatting, diff check and docs check passed. Playwright reached the test after switching Storybook watchers to polling, but Chromium failed before assertions with macOS MachPortRendezvous permission denied (1100); no browser pass is claimed. This does not exercise the installed desktop app or capture user files/conversations.
