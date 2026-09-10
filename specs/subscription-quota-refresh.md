# Subscription quota before a conversation

Status: draft
Translation: pending

A user opening the desktop should be able to check subscription quota before choosing a
model and sending a prompt. Startup refresh and the existing Settings provider refresh
use the same machine-side probe; neither submits a user prompt. Startup work runs in the
background after machine availability, reusing the workspace transports. Successful
machine/config startup probes are remembered for the lifetime of that workspace runtime.
Previously unavailable machines can be retried on a later availability event, without polling.

The existing quota partition supports built-in Claude, Codex, Grok and Kimi providers.
Query quota only through an advertised ACP Core capability; adapters without the query may
supply a startup notification. Unsupported providers do not invent quota. Provider failure
or a five-second quota-query deadline does not discard successfully discovered capabilities.

Successful snapshots feed the shared Machine Flock quota rows used by Settings and the
composer. Missing or failed snapshots retain previous percentages but mark them stale.
An elapsed reset time also makes a displayed window stale; elapsed time alone never means
zero usage. A missing matching row is unavailable. No age-based freshness promise is made
for a window without a reset time. Continuous polling and account switching are outside
this proposal; the existing machine/provider quota partition is retained.

Concurrent requests with the same config and launch inputs share the existing refresh.
Machine-owned cache metadata records refresh attempt order: a query that started before
a newer live update or refresh cannot overwrite it. Cancellation before a durable write
leaves quota unchanged. Rows remain backward readable because ACP values keep their shape
and cache metadata is an optional, separate field.

## Evidence

- [Issue #547](https://github.com/LodyAI/Lody/issues/547) describes the user scenario.
- [Probe](../apps/cli/src/agent/acp-capabilities.ts) and
  [machine persistence](../apps/cli/src/lib/loro/doc.ts) own collection and publication.
- [Decision note](../.agents/notes/proposed/feature/2026-09-10-subscription-quota-refresh.md)
  records the trade-offs. This draft requests human review of intent; automated checks
  do not approve it.
