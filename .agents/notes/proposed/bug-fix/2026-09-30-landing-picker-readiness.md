# Let selectable machines unblock the landing picker

Status: proposed
Translation: current

English | [中文](2026-09-30-landing-picker-readiness.zh.md)

## Abstract

The landing picker waits for the entire document-metadata cache even after a reachable machine with an agent configuration is available. This extends cold-start blocking beyond the data needed to make a selection. The focused fix treats document-cache loading like visibility loading: both block only while no selectable machine exists. Runtime initialization and the initial local-machine probe still block, and defaults restoration keeps its separate metadata guard. The change is a reference implementation pending upstream review; the original Windows startup scenario has not been measured.

## Decision and evidence

[Issue #496](https://github.com/LodyAI/Lody/issues/496) isolates the selector condition from the larger mobile synchronization work in [closed, unmerged PR #317](https://github.com/LodyAI/Lody/pull/317). That historical patch is reference context, not an adopted design or active implementation owner; its closure has no explicit rejection reason.

`getChatLandingInitialDataLoading` previously returned early for an incomplete document cache, bypassing its existing selectable-machine exception for visibility loading. Apply that exception to both loading sources. Retain the independent runtime/probe checks so cached machines do not bypass startup prerequisites. Retain the document-cache check in `useChatLandingDefaults` so stored selections are not finalized or overwritten before metadata arrives.

Waiting for the whole cache would retain the reported picker delay. Removing the cache guard unconditionally would allow misleading empty-state banners before metadata arrives. The chosen condition avoids both: no selectable machine still waits for the cache and visibility query.

## Verification and limits

Extend the existing derived-state suite with selectable-machine cases during both visibility states, plus the no-machine transition from incomplete to ready metadata. That suite and the existing defaults suite pass all 94 tests; `pnpm format` and `pnpm run docs check` also pass. These are code-level regressions, not a Windows desktop reproduction or measured startup-time result. No Spec intent or approval is changed.
