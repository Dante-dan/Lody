# Filter existing onboarding projects locally

Status: proposed
Translation: current

[中文](2026-10-10-onboarding-project-filter.zh.md)

## Abstract

Issue #1386 reports scrolling through 186 connected repositories. The existing view combines local and GitHub entries and selects one project. This reference change filters the existing view locally, keeps selection independent of filtering, and adds keyboard access. It remains a proposal pending upstream review and does not assert human approval.

## Decision and trade-offs

Use one always-visible input for both kinds of project instead of a repository-only or threshold-dependent control: local-only desktop users need the same discovery and the control remains predictable as entries load. Match name, stable key, and displayed detail; never add a cloud request or telemetry payload. Keep single selection because the current completion contract accepts exactly one project; the request's assumed multi-select is not implemented in current code.

Use native buttons for rows, arrow-key focus, Enter activation, and Escape reset. Remove exit animations so filtered-out rows immediately leave the keyboard target set. Filtering does not discard a hidden selected project.

## Scope and verification

Owning [draft Spec](../../../../specs/onboarding-project-filter.md). Extend the existing onboarding flow suite and long-list Storybook state, rather than introduce a separate harness. Tests cover owner matching, visibility, local names, no matches, keyboard focus/selection, and selection after clearing. Actual execution results belong in the contribution handoff; source inspection and tests are not live desktop certification.
