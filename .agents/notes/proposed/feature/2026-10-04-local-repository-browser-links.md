# Local repository navigation without provider identity

Status: proposed
Translation: current

[中文](2026-10-04-local-repository-browser-links.zh.md)

## Abstract

GitLab directories already work as local projects but do not expose a repository
browser action. This reference implementation adds credential-free remote
navigation while keeping GitHub identity and workflows unchanged. An explicit
machine capability protects older strict peers from receiving a new field.
The proposal covers navigation only; merge-request review remains undecided.

## Decision

[Issue #261](https://github.com/LodyAI/Lody/issues/261) and its public discussion
consider either read-only MR review or remote recognition/browser links. This
bounded proposal chooses the latter without claiming maintainer approval.
A provider union would spread GitLab identity into existing GitHub session, PR,
and archival contracts before an MR workflow is agreed. A navigation URL instead
needs no authentication, persistence migration or provider-specific API.

Git remote precedence follows branch remote, then origin, then a sole remote.
The shared parser strips credentials and rejects unsupported URL/path forms.
The machine emits `repositoryBrowserUrl` only after `includeBrowserUrl` opt-in;
the UI negotiates `localProjectBrowserLinks: 1` and rechecks returned navigation.
SSH-to-HTTPS mapping cannot determine a different self-hosted web endpoint.

The [draft Spec](../../../../specs/local-repository-browser-links.md) owns behavior.
Related [native interactions](../../../../specs/desktop-native-interactions.md)
continue to own platform-native actions; no new browser transport is introduced.

## Verification

Owning suites cover remote parsing, real local Git state, toolbar URL safety and
capability negotiation. Repository checks must be reported with their actual
results; no human approval, live GitLab API validation or full MR support is
claimed by this reference implementation.

The two shared suites passed 56 tests, the two component suites passed 37, and
the two Streams RPC suites passed 112.
Shared and Streams RPC typechecks, formatting, documentation, translations,
fast lint and the public-boundary check passed. Root `pnpm check` stopped during
ACP adapter preparation because the existing Devin checkout lacks dependencies.
A frozen-lockfile install restored the checkout dependency links; the final
component typecheck passed. The complete root check was not rerun after repair.
Packaged Electron visual behavior is not exercised.
