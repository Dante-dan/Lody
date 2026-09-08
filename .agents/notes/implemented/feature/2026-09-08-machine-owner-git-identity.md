# Prefer the machine owner's Git identity

Status: implemented
Translation: current

[中文](2026-09-08-machine-owner-git-identity.zh.md)

## Abstract

Lody previously preferred the requester's account email for every turn and could fall back to
the machine Git identity when that email was unusable. The adopted policy instead prefers local
Git configuration only for the machine owner and prohibits that fallback for every other
requester. This preserves the owner's explicit repository identity while preventing a teammate
from being attributed as the machine owner; the remaining trade-off is that a locally configured
email may not be attributed to the owner's GitHub account.

## Decision

Machine ownership is the policy boundary. It is already available at both initial session
creation and continued-turn binding, remains stable when a machine is shared or made private,
and avoids adding workspace-member-count or machine-visibility queries to the prompt path.

The source order is:

- machine owner: effective machine/repository Git identity, resolved Lody/GitHub identity, neutral
  LodyAI identity;
- non-owner requester: resolved Lody/GitHub identity, neutral LodyAI identity.

The non-owner path does not read machine Git configuration. GitHub PR, comment, merge, and push
authorization remains controlled by the separately requester-bound GitHub token.

## Alternatives

Using exact "single-member workspace or private machine" predicates was rejected. The CLI does
not continuously own either authoritative value, both can change during a session, and machine
ownership expresses the isolation boundary without another network dependency.

Keeping requester account email first for the machine owner was also rejected because it ignores
the user's explicit Git configuration and can place a Lody login address into a public commit.

## Evidence and verification

The behavior is implemented by `apps/cli/src/session/git-identity.ts`, with ownership threaded
through `apps/cli/src/session/session-manager.ts` and
`apps/cli/src/session/session-execution-service.ts`. Unit coverage is in
`apps/cli/tests/git-identity.test.ts`. Product intent is recorded in
`specs/git-commit-identity.md` as a draft. The focused nine-test identity suite and CLI typecheck
passed after initializing and building the pinned ACP extension submodules. The repository-wide
check completed typecheck and lint (zero lint errors), then stopped in the unrelated components
suite because its React runtime exposed `act` as a non-function across 152 test files.
