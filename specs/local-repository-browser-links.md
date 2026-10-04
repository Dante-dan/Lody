# Local repository browser links

Status: draft
Translation: current

[中文](local-repository-browser-links.zh.md)

## Scenario

A user adds an already-cloned GitLab or other Git repository as a local project.
The chat landing toolbar can open that repository in the browser without a GitHub
account or GitLab API integration. This is a proposed navigation slice of
[Issue #261](https://github.com/LodyAI/Lody/issues/261), not merge-request support.

## Responsibilities and behavior

The machine owning the directory reads Git remote configuration. It considers
push then fetch URLs for the current branch's configured remote, then origin;
with neither, a sole remote is eligible. It returns the first safe browser URL.
HTTP/HTTPS retain their web port; SSH maps to HTTPS without the SSH port.
Nested repository groups remain intact. User information, query and fragment are
removed. Non-web/SSH transports, local paths and unsupported path segments have
no browser action. This does not identify a provider or enable GitHub workflows.

The renderer opts into the optional response field only when the machine
advertises `localProjectBrowserLinks: 1`. Older requests receive the original
strict response shape. Missing capability or URL hides the action. Electron IPC
and Streams RPC carry the same explicit opt-in. The renderer checks the URL again
before handing navigation to its existing external-URL port.

The project stays local; there is no account discovery, token storage, API call,
merge-request review, write action, or new persistent project metadata.

## Evidence and limits

- [Remote parser](../packages/shared/src/worktree-paths.ts)
- [Git state](../packages/shared/src/node/local-project.ts)
- [Protocol facade](../packages/components/src/providers/workspace-machine-rpc-facade.ts)
- [Owning note](../.agents/notes/proposed/feature/2026-10-04-local-repository-browser-links.md)

This draft has no human approval. Self-hosted SSH deployments whose browser
endpoint differs from their SSH host require a future explicit mapping design.
