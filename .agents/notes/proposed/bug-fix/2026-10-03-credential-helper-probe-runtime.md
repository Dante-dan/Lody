# Credential helper diagnostics use the current runtime

Status: proposed
Translation: current

[中文](2026-10-03-credential-helper-probe-runtime.zh.md)

## Abstract

Git authentication failure diagnostics launched the credential helper using a
`node` executable discovered through PATH. An embedded desktop daemon can already
run JavaScript while its inherited PATH contains no Node installation, causing the
diagnostic probe to fail before inspecting credentials. Use `process.execPath`
and preserve the existing child environment, including `ELECTRON_RUN_AS_NODE`.
This is a focused diagnostic fix; it does not remove Node requirements from user
scripts or change agent runtime selection.

## Decision and scope

The [report](https://github.com/LodyAI/Lody/issues/1186) concerns Node discovery in
desktop-launched execution. `WorktreeManager.runCredentialHelperProbe` runs a
Lody-owned JavaScript helper, so the runtime already executing the daemon is the
appropriate executable. It keeps the exact frozen broker/context environment and
the credential protocol unchanged. The alternative, finding another Node through
PATH, repeats the failed discovery and can select a different runtime.

The existing [Electron descendant contract](../../../../apps/electron/AGENTS.md#embedded-cli-and-native-dependencies)
requires inheriting `ELECTRON_RUN_AS_NODE`; the probe already forwards its prepared
environment. No new environment filtering, credential routing, or Spec intent is
introduced. The [broker routing tests](../../../../apps/cli/src/session/worktree/worktree-manager-broker-auth.test.ts)
remain the owning suite.

The [personal credential fallback decision](../../implemented/bug-fix/2026-09-30-github-personal-identity-silent-fallback.md)
owns credential selection. This proposal changes only how its diagnostic helper
starts and does not replace that decision.

## Verification

The regression drives a failed Git fetch with no Node on PATH, runs the generated
helper as a real child using a deterministic local broker fixture, and checks the
resulting successful credential diagnostic and frozen requester attribution.
It does not claim a packaged Electron launch or a complete fix for every Node
dependency described by the issue.
