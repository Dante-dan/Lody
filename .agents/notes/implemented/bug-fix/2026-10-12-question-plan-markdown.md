# Question plan detail renders as Markdown

Status: implemented
Translation: current

[中文](2026-10-12-question-plan-markdown.zh.md)

## Abstract

The generic question card renders its question body with the shared Markdown renderer. DeepSeek Harness includes complete plan detail in that body, so headings, lists and code now remain readable without changing its explicit approval option or introducing a Plan Mode transition.

## Decision

[Issue #1489](https://github.com/LodyAI/Lody/issues/1489) reports literal Markdown in the Harness plan-exit card. The adapter already joins the question and detail into the elicitation description; the host preserves that description as the generic question body. Rendering it as plain text loses the structure.

Reuse the existing compact Markdown renderer in both interactive and answered cards. Keep answer ids, labels, custom answers and submission unchanged. Do not route Harness through the switch-mode PlanPanel: the [draft question Spec](../../../../specs/deepseek-harness-user-questions.md) explicitly requires the generic question card and does not authorize a permission or mode transition. The [original bridge decision](../feature/2026-09-20-dsh-user-questions.md) remains applicable.

## Verification

After restoring dependencies from the unchanged lockfile, the owning card suite passes all 17 tests and component typechecking passes. Coverage includes semantic headings, emphasis, inline code, list items, explicit approval submission and answered replay. These are synthetic repository fixtures, not an author desktop reproduction.

Documentation checks, scoped Oxlint and root formatting pass. The initial root `pnpm check` stopped at missing `@lody/e2ee-core` dependencies; that package's typecheck passes after restoration, but the complete root check was not rerun. An initial card-suite rerun hit the existing touch test's five-second timeout; the unchanged default timeout passes after dependency restoration. Live Harness/model desktop exercise has not been performed.
