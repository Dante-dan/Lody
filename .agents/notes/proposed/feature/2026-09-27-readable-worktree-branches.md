# Readable names for new worktree branches

Status: proposed
Translation: current

[中文](2026-09-27-readable-worktree-branches.zh.md)

## Abstract

Issue #289 reports that opaque worktree branch names make session work hard to
identify and publish. The proposed path keeps the initial ID branch until the
first accepted title arrives, then renames only a new, unchanged and unpublished
branch while reconciling Git with Session metadata. This avoids putting draft
prompt text in preparation RPC, but requires a small durable rename state and
crash-recovery check before it can be implemented safely.

## Decision and alternatives

Passing `SessionConfig.title` to the branch allocator alone is insufficient:
the title is optional, speculative worktree creation precedes the durable
Session, and Provider-generated titles arrive after initialization. Deriving a
name from initial prompt text would cross the preparation contract that keeps
draft text out of its RPC and could put sensitive text in a public branch name.
Renaming every existing `lody/<id>` branch on title change would affect old
Sessions and branches that users may have pushed. A one-time new-session marker
with an expected branch and HEAD provides a narrow eligibility boundary.

The proposal in [the draft Spec](../../../../specs/readable-worktree-branches.md)
defers naming until a title is accepted, then fails closed if the branch or
publication state has changed. It requires an actual Git ref and SessionMeta
reconciliation path; a slug helper by itself has no user-visible value.

## Evidence and status

- [Issue #289](https://github.com/LodyAI/Lody/issues/289) has no maintainer
  discussion or alternate implementation at the time of this proposal.
- Current [worktree creation](../../../../apps/cli/src/session/worktree/worktree-manager.ts)
  allocates before title generation; [ACP title Spec](../../../../specs/acp-session-titles.md)
  documents the later Provider event.
- No code behavior or tests are claimed for this design-only reference. The
  publication and recovery rules remain open for maintainer review. No upstream
  PR exists; the fork PR context-handoff requirement remains separate.
