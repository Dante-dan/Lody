# Session-scoped remote worktree preview

Status: draft
Translation: current

[中文](remote-worktree-preview.zh.md)

A user viewing a session on another machine follows an absolute file link into a
sibling Git worktree. The preview should show the file from that worktree without
redirecting it into the session workspace. The user must first authorize that
specific root on the machine owning the session. This draft proposes a new grant
boundary; current remote preview does not implement it. No human approval of this
revision or runtime access expansion is claimed.

## Responsibilities

The owning machine's trusted authorization surface presents the session owner,
canonical root and read-only scope before explicit confirmation. Agent output,
Markdown links, changed shell directories and Git repository membership cannot
issue a grant. The remote viewer cannot grant itself arbitrary host access.

The daemon owns grant storage and validation. A grant binds one existing authorized
session owner to one canonical worktree root and a lifecycle identity that changes
when the worktree is removed/replaced. Repository association is checked after
explicit authorization; association alone is insufficient. A grant never applies
to every session, repository or sibling worktree.

The preview service checks the current session authorization and current grant
for each read, resolves symlinks, and enforces containment in the canonical granted
root. The grant supplements the existing preview boundary only for its bound
session. Existing workspace, temporary/chat roots and operator-configured extra
roots retain their current semantics; the daemon-wide environment allowlist is
not a session-scoped grant.

The viewer preserves the resolved absolute target and branch-specific file
identity. A granted external file remains readonly; this does not authorize
Code Collab activation, saving, shell execution or opening that remote path on
the viewer's machine. Existing response size and binary limits still apply.

## Lifecycle and protocol requirements

Creation requires explicit host-side approval by the session's authorized owner.
A read with no matching valid grant follows today's denial behavior. Session
reassignment invalidates the old owner's grant. Revocation or root removal blocks
subsequent reads; a request must recheck authorization before returning content
if revocation occurred during resolution/read. Content already displayed cannot
be recalled, and the UI must not imply otherwise.

Grants must not survive replacement of a worktree at the same pathname. Failure
to establish its lifecycle identity fails closed. Durable grants, if chosen,
require owner and lifecycle revalidation after daemon restart before use; a stale
cache must not restore access. Unsupported clients/daemons retain existing preview
behavior, with no fallback to Electron's same-machine arbitrary-file capability.

Storage representation, lifecycle identity proof, authenticated host confirmation,
protocol negotiation and revocation propagation remain design questions for human
review. This draft specifies their required outcomes, not a wire schema, endpoint
name or completed implementation. Hosted backends and private records are outside
this public Spec. Approval must link to this exact revision before the proposed
permission/protocol change is implemented.

## Acceptance and test mapping

The following are planned checks for the eventual implementation, not executed
runtime tests of this documentation change. Extend the existing owning suites.

| Acceptance boundary         | Observable scenario and planned validation                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Correct worktree identity   | In path-policy/service suites, authorize root B for a session in root A; preview B's file and verify B's content/canonical path, with same-named A file unchanged. Remote UI QA verifies branch-specific identity. |
| Session and owner isolation | In daemon authorization/handler tests, deny an ungranted second session, different owner and reassigned session even when the repository matches.                                                                  |
| Canonical containment       | In path-policy tests, deny sibling roots, parent traversal and symlinks escaping the grant; grant no existence oracle through missing-path errors. Preserve existing case/ambiguity rules.                         |
| Revocation and replacement  | With deterministic grant state changes, deny reads after revoke/remove/replacement and revoke-during-read before response; restart cannot revive an invalid grant.                                                 |
| Read-only boundary          | In service/client tests, keep external/readonly result and existing save rejection; UI QA confirms preview does not activate Code Collab or OS actions on the viewer machine.                                      |
| Compatibility and limits    | Existing callers without negotiation remain restricted; service tests preserve bounded complete remote responses and existing oversize refusal.                                                                    |

## Evidence and implementation gap

- [Issue #472](https://github.com/LodyAI/Lody/issues/472) describes the remote sibling-worktree scenario; it is reported evidence, not an end-to-end replay here.
- [Owning proposal](../.agents/notes/proposed/architecture/2026-09-30-remote-worktree-preview.md) records current implementation and alternatives at `8304ae9e5a4b1125b81500d391228aaae48243e5`.
- [Preview rules](../apps/cli/src/lib/file-preview/AGENTS.md), [path policy](../apps/cli/src/lib/file-preview/file-preview-path-policy.ts), [service tests](../apps/cli/src/lib/file-preview/file-preview-service.test.ts) and [message handler](../apps/cli/src/lib/message-handler.ts) define current boundaries and owning checks.
- [Local link Spec](local-file-link-actions.md) preserves the separate same-machine Electron behavior. No grant storage, protocol or runtime change is delivered by this draft.


## Reference validation

The optional service seam in `file-preview-session-grants.ts` now has executable lifecycle coverage in the existing service suite. No production daemon, authenticated host confirmation UI, grant RPC or remote UI replay is delivered. The draft remains unapproved.

## Bounded host adapter (Electron-owned root sessions)

Production preview now receives the registry, but grants remain empty until explicit host confirmation. The local-only `file/grant-worktree` request accepts a session and root; it does not accept approval, principal or authorization generation. It requires a live root session owned by the daemon user on this machine, the same canonical Git common directory, and a registered exact worktree. Child sessions are unsupported in this slice.

Only an Electron instance actually supervising this CLI child can approve: the daemon sends a fresh challenge over the inherited private Node IPC pipe, and Electron main displays a native dialog naming the session, owner and canonical root. Cancel is the default. The matching result must return over that same private peer before the 30-second deadline. Duplicate, stale, concurrent and disconnected requests fail closed. The registry rechecks generation and root identity after the dialog. Supervisor capabilities remain in main/worker memory and are not logged, persisted or exposed to the renderer. Standalone daemons and Electron attached to an existing runtime lack this peer and deny grants.

Archive, deletion, owner/machine/parent/project metadata changes and local `file/revoke-worktree` advance daemon-owned session generations and revoke access. Restart starts empty. The existing remote `file/preview` response remains bounded and readonly; no remote grant RPC, save capability or Code Collab activation is added. A local control caller can request a native confirmation, but cannot directly approve. This is an adapter/API slice; there is no new remote viewer grant button. Native desktop UI and cross-machine end-to-end QA have not been performed. The draft is not approved intent and this does not claim every #472 deployment is supported.
