# Let Codex own its session title, and split the ACP title predicates

Status: implemented
Translation: pending

## Abstract

Lody wanted every builtin agent to stop carrying its own `titleGeneration`
session config and take the session title from the ACP adapter instead. An audit
of all five builtin adapters shows that only acp-extension-claude and
acp-extension-codex actually generate titles; Grok, Kimi and the DeepSeek Harness
publish nothing usable, so the isolated generator and its config must stay for
them. Codex was the one adapter doing the work twice — Lody spawned an isolated
codex ACP session for the title while the adapter independently generated and
pushed its own — so Codex now joins Claude as an ACP-owned title provider. Doing
that required splitting the single `usesAcpProvidedSessionTitle()` predicate,
because the two adapters need opposite trust rules and conflating them would have
promoted Codex's first-prompt preview to the session title. Branch naming still
falls back to the isolated generator when no ACP title has landed yet, so this
reduces title work but does not yet eliminate the isolated session.

## The audit

Each adapter was read at the commit this repository pins.

| Adapter | Version | Publishes a title | `_meta.lody.titleSource` | Real generation |
| --- | --- | --- | --- | --- |
| `acp-extension-claude` | 0.70.0 | yes | no `_meta` at all | yes — SDK `generate_session_title` control request |
| `acp-extension-codex` | 1.10.0 (since 1.8.0) | yes | yes, generated titles are `explicit` | yes — cheap-model turn on an ephemeral thread |
| `acp-extension-grok` | 0.1.0 | no | no | no |
| `acp-extension-kimi` | acp-server 0.0.1 | yes, but the title is the first prompt truncated to 200 chars | no `_meta` at all | no |
| `acp-extension-dsh` | 0.1.1 | no | no | no |

Two near-misses are worth recording because they change what "add title support"
would cost later. Kimi's engine already tracks
`SessionTitleKind = 'replaceable' | 'generated' | 'custom'`, and it has a real
generator (`SessionTitleService`, backed by Moonshot's managed `chat_title`
endpoint) — but the generator is reachable only from the kap-server HTTP route and
the node SDK, and the kind is discarded at the ACP boundary in
`packages/acp-server/src/events-map.ts`. The DeepSeek Harness pins
`@deepseek-ai/dsh-session-title` in its dependency closure but never mounts it in
`createDeepSeekHarnessCordisConfig`, so the plugin is inert. Grok is a pure stdio
proxy with no title code of any kind and no upstream title capability to forward.

## Decision

`usesAcpProvidedSessionTitle()` answered two different questions at three call
sites, and Codex needs opposite answers to them:

- *May Lody skip its isolated generator and hide the title config?* Yes for
  Claude and Codex. This is now `acpOwnsSessionTitleGeneration()`.
- *May Lody trust a pushed title that carries no `titleSource`?* Only for Claude,
  which sends a bare `session_info_update`. This is now
  `trustsUntaggedAcpSessionTitle()`.

Codex must stay out of the second predicate. It emits a `fallback` prompt-preview
title before its generated `explicit` one, and `apps/cli/src/agent/AGENTS.md`
already required rejecting that preview. Extending the original single predicate
to Codex would have silently made the raw first prompt the session title — the
main trap this split exists to prevent.

The `titleGeneration` config surface (schema field, settings section, CLI flags)
is deliberately left in place. Removing it would strip the cheap-model and
least-privilege-mode selection that Grok, Kimi, DeepSeek Harness, registry and
custom providers still rely on. The config simply stops being reachable for
Codex, as it already was for Claude.

"Unreachable" has to hold on every path, not just the settings form. Branch
naming resolved the persisted `titleGeneration` for whatever agent it was naming
a branch for, so a value stored before this change would have kept steering
Claude and Codex runs after their config disappeared from the UI. Branch naming
now skips that lookup for ACP-owned agents and lets
`computeTitleGenerationDefaults()` pick from the live `configOptions` instead.

## Trade-offs and limits

Codex generates its title after the first turn completes and skips generation
entirely on resumed sessions (its internal source is `unknown` there), so a
resumed codex session no longer gets a Lody-generated title. Generation is also
best-effort inside the adapter and swallows failures without signalling the
client, so a failed generation now leaves the draft title rather than falling
back to Lody's generator.

This change does not reach zero isolated ACP sessions. `generateBranchNameWithTimeout`
reuses an in-flight or already-stored generated title, and otherwise still calls
`generateTitleIsolated()`; with the title path skipped, Codex now takes that
branch as Claude already did. Making branch naming wait for the ACP-pushed title
within its existing 20s budget is the remaining step, and is not attempted here
because the timeout path currently abandons the rename rather than falling back
to the prompt text — changing that affects every provider, not just the
ACP-owned ones.

Verification is type checks, lint, and the shared unit tests covering both
predicates. No live codex, Kimi, Grok or DeepSeek session was exercised.
