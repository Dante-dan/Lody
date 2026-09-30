# Load Settings bodies on demand

Status: proposed
Translation: current

[中文](2026-09-30-settings-lazy-modules.zh.md)

## Abstract

The desktop renderer imports Settings route definitions even when startup lands on Chat.
Those definitions and the desktop overlay previously imported every tab body, putting
Settings-only work on the initial module graph. Shared lazy components now defer each
body until the route or overlay renders it, and the desktop overlay itself loads only
when opened. This preserves navigation and capability decisions; it adds an asynchronous
first render and does not claim a measured cold-start time improvement.

## Decision

[Issue #493](https://github.com/LodyAI/Lody/issues/493) identifies two independent eager
paths: the generated route tree and `MainLayout`'s desktop overlay. Making only the
overlay lazy leaves the route path intact. Enabling all-route automatic splitting in
the Electron build would expand this change beyond Settings. Instead,
`lazy-settings-components.ts` owns shared dynamic imports for tab bodies; both routes
and the overlay use the same lazy components. TanStack's `lazyRouteComponent` preserves
route preloading and missing-module error handling. Wrapper routes keep their existing
search parsing, native redirects, and props. Suspense stays inside the Settings page
or overlay so a pending tab does not suspend the surrounding workspace shell.

The lightweight overlay container reads the open atom and viewport; closed Settings
and mobile layouts do not import the desktop overlay. Capability filtering, machine
and project selection, cache ownership, and page header slots remain unchanged.
Settings content loads on its first visit; subsequent visits reuse the loaded module.
Other product consumers may independently import shared settings functionality, so
this does not promise that every dependency of a Settings body disappears from startup.

## Verification and limits

Existing route/navigation suites verify native redirects and browser Settings content
with the asynchronous loading boundary. Route generation and the repository checks
are run for the changed revision; their actual outcomes belong in the contribution's
test plan. Windows cold-start timing and Electron interaction have not been measured.
This implementation changes module loading, not the intent of the draft startup
landing Spec, and does not approve that Spec.
