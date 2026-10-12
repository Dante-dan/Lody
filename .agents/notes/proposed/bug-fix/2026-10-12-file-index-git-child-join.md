# Join Git scan children before filesystem fallback

Status: proposed
Translation: current

[中文](2026-10-12-file-index-git-child-join.zh.md)

## Abstract

A rejected file listing currently lets the scan return while its deleted-file Git
query is still running. Issue [#1507](https://github.com/LodyAI/Lody/issues/1507)
reports that the Tinypool worker can then park or terminate before the child is
reaped. The reference patch joins both commands with `Promise.allSettled` before
returning the existing fallback. It preserves parallel execution and best-effort
deleted-file filtering; it does not change the worker pool or process facade.

## Decision and limits

The shared scan core is used by the worker and main-thread fallback. Join ownership
belongs there, rather than changing Tinypool atomics or adding exit listeners to a
process facade that already waits for process completion. A failed primary listing
still returns filesystem fallback; a failed deleted listing still permits the
successful primary list, preserving current behavior.

The existing worker test suite adds a deterministic primary-rejection / deferred
sibling case that observes fallback timing. Its synthetic commands validate the
join boundary, not macOS kernel reaping or the production Nightly teardown order.
The existing Git workspace cases exercise successful indexing. Upstream adoption
and user publication of authoring context remain pending.
