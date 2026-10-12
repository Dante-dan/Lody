# Keep the sent-message editor on its trailing edge

Status: implemented
Translation: current

[中文](2026-10-12-full-width-message-editor.zh.md)

## Abstract

In a wide full-width conversation, editing a user message expands its outer stack to the whole available width but leaves the inner 800px-capped content at the leading edge. The editor then aligns to that inner box instead of the avatar and metadata at the trailing edge. A logical auto margin on the existing content box preserves its width cap while anchoring it to the user stack's trailing edge. The fix changes layout only; editing, mentions, saving and attachment behavior remain owned by their existing components. Browser geometry verification is recorded below with its actual environment limits.

## Decision and scope

[Issue #1495](https://github.com/LodyAI/Lody/issues/1495) reports this in macOS nightly 0.105.0-nightly.6. At upstream `3ac76bad`, `UserMessage` in `view.tsx` gives the editing wrapper `w-full`, while its inner content retains `sm:max-w-[800px]`. Normal block flow leaves the capped content on the leading side. The inner editor's `items-end` cannot align across the unused space outside that cap.

The existing StyleX conversation surface owns the logical trailing alignment via `marginInlineStart: auto`. Increasing the cap or changing the avatar/metadata rail would change the intended conversation geometry; aligning the capped box preserves it. No Spec, public API, Effect lifecycle, data, provider, or shared platform contract changes.

The existing [edit/resend mentions decision](../feature/2026-09-28-edit-resend-mentions.md) continues to own edit eligibility and mention behavior.

## Verification

The owning `UserMessageEditor` story now includes a full-width production `MessageRowView`. The existing composer browser suite measures the editor card against the metadata's right edge at 1800px and 600px, enters editing through the actual button, confirms focus, and cancels back to the message.

Repository typechecking and linting passed. The full `pnpm check` run then stopped at a script test because Node 22.16 could not import the existing raw TypeScript session-link module. Running the script suite with Node 22.22.3 passed all 51 tests; the focused sender-view suite passed all 5 tests. The later workspace unit-test stage of the full command was not run. Formatting and documentation checking passed.

Storybook became ready with polling watchers, but the official Playwright Chromium launch failed with a macOS MachPort permission error before page or geometry assertions. No browser RED/GREEN result or visual pass is claimed. The reported macOS nightly application was not exercised; the frozen-lockfile install linked dependencies but its Electron cache postinstall was denied by the local filesystem permissions.
