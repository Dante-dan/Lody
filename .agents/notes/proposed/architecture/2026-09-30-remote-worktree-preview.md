# Remote worktree preview authorization

Status: proposed
Translation: current

[中文](2026-09-30-remote-worktree-preview.zh.md)

## Abstract

A remote session bound to a main checkout cannot preview an absolute link into a sibling worktree, even when Git reports the same repository. The current containment policy intentionally rejects this target; the same-machine Electron fix in PR #892 does not authorize remote reads. A host operator can explicitly allow a precise worktree root through the existing environment setting, but that grant is machine-wide rather than session-scoped. A future session-scoped grant should require explicit authorization on the owning machine, preserve the canonical target and readonly state, and support revocation; this note proposes that boundary without implementing or approving new access.

## Current evidence

Issue [#472](https://github.com/LodyAI/Lody/issues/472) describes a desktop viewing a session on another machine. Its installed-version path-policy experiment accepted the file only when the supplied workspace root was the referenced worktree. That is reported evidence, not an end-to-end replay performed for this note.

At inspected main `8304ae9e5a4b1125b81500d391228aaae48243e5`, [`file-preview-path-policy.ts`](../../../../apps/cli/src/lib/file-preview/file-preview-path-policy.ts) adds `LODY_FILE_PREVIEW_EXTRA_ROOTS` (platform path-delimiter separated) to the workspace, OS temp and chat roots. Authorization uses symlink-resolved targets and roots; missing-path classification does not grant a read. [`message-handler.ts`](../../../../apps/cli/src/lib/message-handler.ts) supplies the session-owner workspace to the preview service. Git membership does not add roots.

The host operator can set, for example, `LODY_FILE_PREVIEW_EXTRA_ROOTS=/home/example/projects/sample-repo-worktrees/topic-branch` when starting the daemon. This explicitly permits remote preview reads under that root for sessions served by that daemon; it is not a per-session permission. The operator must choose a trusted exact root, rather than a parent containing unrelated worktrees or private files. Preview retains external/readonly identity and does not grant writes. This is a bounded existing option, not a complete implementation of the issue's session-scoped association request.

[PR #892](https://github.com/LodyAI/Lody/pull/892) is merged and preserves targets for same-machine Electron. Its [owning note](../../implemented/bug-fix/2026-09-22-local-conversation-file-paths.md) explicitly keeps remote authorization unchanged. Its local path capability must not be exported to remote RPC.

## Proposed session-scoped boundary

A grant would be made by an explicit user action on the owning machine, bound to the existing authorized session owner and one canonical worktree root. Agent Markdown, shell cwd changes and `git worktree list` are descriptive evidence, not permission. Repository validation can confirm an association after authorization, but must not authorize every sibling worktree automatically.

The daemon would check the current grant on each remote preview, resolve the target through symlinks, and require exact containment in that root. Removed or revoked grants fail closed; reusing a path for another worktree must not silently inherit access. External files remain readonly and absolute targets retain their branch-specific identity. Preview must still avoid activating Code Collab. The grant's storage, actor verification and propagation/revocation contract require an explicit draft Spec and human approval of that revision before it can be treated as approved intent.

## Alternatives and limits

Binding a new session directly to the worktree uses the existing workspace boundary but does not serve links in the original session. The environment allowlist serves the original remote session but has wider machine-wide scope. Automatically trusting repository membership or importing Electron's arbitrary-file capability widens access without an explicit grant and is not proposed.

This investigation is static code/contract review. No remote UI replay, new implementation, grant lifecycle test or approval is claimed. The next step is maintainer feedback on the supported per-session association and authorization owner before introducing a storage or protocol contract.
