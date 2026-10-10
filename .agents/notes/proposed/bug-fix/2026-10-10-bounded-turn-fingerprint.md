# Bound turn working-tree fingerprints

Date: 2026-10-10
Status: proposed
Translation: current

[中文](2026-10-10-bounded-turn-fingerprint.zh.md)

## Abstract

Issue #1369 reports a multi-minute pre-prompt delay while Git hashes an untracked heap dump. Turn baseline capture currently fingerprints every dirty and untracked file before ACP dispatch, and fallback turn statistics repeat the hashing. This change uses bounded raw-content SHA-256 fingerprints for regular files up to 5 MiB in both paths. Oversized, unavailable, or changing files stay unknown and remain visible rather than being incorrectly filtered as unchanged. The complete daemon/ACP backlog chain remains unverified.

## Evidence and decision

The reporter measured `git hash-object` on an 11.687 GB heap dump at approximately 312 seconds and a diagnostic adapter excluding it at approximately 174 ms. Those are reporter measurements, not our reproduction. Current source awaits baseline capture before prompting, including stale-ACP recovery.

A local reader checks the file type and size, reads at most 5 MiB plus one byte, and closes the handle on all paths. It rejects concurrent size/timestamp changes. Raw hashes are private equality tokens, not Git object IDs; avoiding Git filters also avoids running repository-configured filters on the prompt path. Start and end use the same reader. No public protocol changes.

Ignoring filenames/extensions would miss other artifacts. Metadata-only fingerprints could hide same-size edits; partial content hashes could hide unsampled edits. Unknown fingerprints deliberately preserve the existing conservative attribution behavior: an oversized preexisting artifact can appear as a zero-line turn diff. This is preferable to hiding a real edit. Git status/diff enumeration and tracked numstat are still unbounded in total work; this fix bounds per-file fingerprint reads only.

## Verification

The owning git-diff-stats suite adds a real-filesystem regression using a synthetic 12 GiB sparse file and a same-size source edit. It confirms the artifact is omitted from the equality baseline, ordinary edits remain detectable, and missing/outside paths are unknown. No captured user data, real heap dump, or ACP transcript is used. Full daemon/ACP reproduction is not claimed. Root-check results belong in the contribution's test plan.
