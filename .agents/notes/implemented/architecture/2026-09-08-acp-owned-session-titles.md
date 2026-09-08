# Let Codex and Grok own their session titles, and split the ACP title predicates

Status: implemented
Translation: pending

## Abstract

Lody wanted every builtin agent to stop carrying its own `titleGeneration`
session config and take the session title from its ACP adapter instead. An audit
of all five builtin adapters found three that already produce a usable title —
Claude, Codex, and, contrary to a first reading that inspected only our proxy,
Grok, whose official runtime generates one and pushes it, confirmed by live probe
— so all three now take the ACP title while Kimi and the DeepSeek Harness keep
the isolated generator. Codex and Grok were both doing the work twice, each
generating a title that Lody then either duplicated or discarded. Delivering this
required splitting the single `usesAcpProvidedSessionTitle()` predicate into
ownership and trust, because Codex tags its titles and emits a prompt-preview
`fallback` first while Claude and Grok push one bare authoritative title, and
conflating the two would have promoted Codex's preview to the session title. The
cost is that title wording now belongs to the adapters, and branch naming still
falls back to the isolated generator when no ACP title has landed yet, so this
removes duplicated work without yet eliminating the isolated session.

## The audit

Each adapter was read at the commit this repository pins.

| Adapter | Version | Publishes a title | `_meta.lody.titleSource` | Real generation |
| --- | --- | --- | --- | --- |
| `acp-extension-claude` | 0.70.0 | yes | no `_meta` at all | yes — SDK `generate_session_title` control request |
| `acp-extension-codex` | 1.10.0 (since 1.8.0) | yes | yes, generated titles are `explicit` | yes — cheap-model turn on an ephemeral thread |
| `acp-extension-grok` | 0.1.0 (runtime 1.0.13) | yes — the runtime pushes it and the proxy forwards it | no `_meta` at all | yes — upstream `title_refresh.rs` |
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
`createDeepSeekHarnessCordisConfig`, so the plugin is inert.

Grok is the sharpest correction to an earlier reading of this audit. The adapter
is a pure stdio proxy with no title code, which is easy to mistake for "Grok has
no titles". The official `@xai-official/grok` 1.0.13 runtime pinned by
`runtime-manifest.json` in fact ships a full automatic title generator: strings in
the shipped binary include the `session_title` tool-call prompt ("Final session
title, just 5-10 word descriptive title for the session"), the failure path
"session title generation failed, falling back to truncated user text", and user
documentation stating the title is generated right after the first prompt,
regenerated over a couple of early turns, then frozen, with `/rename` and
`/rename --auto` as manual overrides. Decisively, the logic lives at
`crates/codegen/xai-grok-shell/src/session/acp_session_impl/title_refresh.rs` —
inside the ACP session implementation, alongside `goal.rs`, `mcp.rs` and
`prompt_build.rs` — so it is not TUI-only, and the runtime's ACP `SessionUpdate`
enum includes `session_info_update` with `title` and `updatedAt`.

That title does reach the ACP wire, as a pushed notification. A probe run on a
credentialed machine against runtime 1.0.13 — one short turn, then a 25s wait —
produced exactly one push per run, both talking straight to `grok agent stdio`
and routing through `acp-extension-grok`:

```json
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"01a08127-...",
 "update":{"sessionUpdate":"session_info_update","title":"Reply with single word ok"}}}
```

The same title landed in the session's on-disk `summary.json` (`session_summary`
non-empty, so generation genuinely ran), and the proxy filtered nothing — the two
paths differed only in generated wording. Crucially the message carries **no
`_meta` at all**, so Grok has the same shape as Claude: one authoritative pushed
title with no `titleSource` to gate on. Lody therefore already receives Grok's
title today and discards it in `handleAgentSessionTitleUpdate` for want of a tag.
Only one push was observed, with no `fallback`-style preview beforehand.

The pull path does not exist in the mode Lody runs: `x.ai/session/info` answers
`-32601 Method not found` under `grok agent stdio`, direct and through the proxy
alike. The literal string is present in the shipped binary, so the method is
presumably registered on some other channel, but not on the ACP agent one. That
has a consequence beyond titles, recorded here because the evidence is in hand:
`proxy.js` issues `internalRequest('context', ...)` after `model_changed` and at
session start, and drops the reply when it is an error, so builtin Grok's
context-window usage notification is silently dead against this runtime. Fixing
that is separate work and is not attempted here.

## Decision

`usesAcpProvidedSessionTitle()` answered two different questions at three call
sites, and Codex needs opposite answers to them:

- *May Lody skip its isolated generator and hide the title config?* Yes for
  Claude, Codex and Grok. This is now `acpOwnsSessionTitleGeneration()`.
- *May Lody trust a pushed title that carries no `titleSource`?* Only for Claude
  and Grok, which both send a bare `session_info_update`. This is now
  `trustsUntaggedAcpSessionTitle()`.

The two sets are deliberately not the same, and Codex is the reason. It emits a
`fallback` prompt-preview title before its generated `explicit` one, and
`apps/cli/src/agent/AGENTS.md` already required rejecting that preview. Keeping
one predicate and extending it to Codex would have silently made the raw first
prompt the session title — the main trap this split exists to prevent. Grok, by
contrast, was observed to push exactly one title with no preview, so it joins
Claude in the trusted-untagged set.

The `titleGeneration` config surface (schema field, settings section, CLI flags)
is deliberately left in place. Removing it would strip the cheap-model and
least-privilege-mode selection that Kimi, the DeepSeek Harness, registry and
custom providers still rely on. The config simply stops being reachable for Codex
and Grok, as it already was for Claude.

"Unreachable" has to hold on every path, not just the settings form. Branch
naming resolved the persisted `titleGeneration` for whatever agent it was naming
a branch for, so a value stored before this change would have kept steering
Claude, Codex and Grok runs after their config disappeared from the UI. Branch naming
now skips that lookup for ACP-owned agents and lets
`computeTitleGenerationDefaults()` pick from the live `configOptions` instead.

## Trade-offs and limits

Codex generates its title after the first turn completes and skips generation
entirely on resumed sessions (its internal source is `unknown` there), so a
resumed codex session no longer gets a Lody-generated title. Generation is also
best-effort inside the adapter and swallows failures without signalling the
client, so a failed generation now leaves the draft title rather than falling
back to Lody's generator.

Handing titles to the adapters also hands over their wording. None of the three
sees `DEFAULT_TITLE_GENERATION_PROMPT`, so constraints it carries — the 26-letter
English budget, the single-line rule — no longer apply to them. Grok additionally
keeps refining its title over the first few turns before freezing it, so a Grok
session title can change after it first appears.

This change does not reach zero isolated ACP sessions. `generateBranchNameWithTimeout`
reuses an in-flight or already-stored generated title, and otherwise still calls
`generateTitleIsolated()`; with the title path skipped, Codex now takes that
branch as Claude already did. Making branch naming wait for the ACP-pushed title
within its existing 20s budget is the remaining step, and is not attempted here
because the timeout path currently abandons the rename rather than falling back
to the prompt text — changing that affects every provider, not just the
ACP-owned ones.

Verification is type checks, lint, and the shared unit tests covering both
predicates, plus the branch-name cases for all three ACP-owned agents. The Grok
behaviour rests on the live probe described above; no live Codex, Kimi or
DeepSeek session was exercised.
