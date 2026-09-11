# Declare macOS local-network access for configured endpoints

Status: implemented
Translation: current
PR: https://github.com/LodyAI/Lody/pull/594

[中文](2026-09-11-macos-local-network-permission.zh.md)

## Abstract

The packaged macOS desktop can launch agent helpers that connect to network endpoints configured by
the user, including services on the local network. macOS attributes a helper's local-network access
to its responsible app, so the app now carries a clear `NSLocalNetworkUsageDescription` in its
packaged `Info.plist`. The app does not browse for or register Bonjour services, so it deliberately
does not declare `NSBonjourServices`; this change enables the system permission explanation without
claiming that it diagnoses every DNS, TLS, proxy, or routing failure.

## Decision and scope

- `apps/electron/electron-builder.yml` owns the packaged macOS `Info.plist` additions. Its local
  network usage text explains that Lody connects to services the user configures.
- Child agent processes do not receive separate declarations. Apple TN3179 states that macOS tracks
  the responsible code for a spawned helper and records the choice for the containing app.
- `NSBonjourServices` remains absent because Lody connects to arbitrary configured endpoints rather
  than registering or browsing for specific Bonjour service types.
- No retry, DNS, TLS, proxy, diagnostics, entitlement, or network-discovery behavior changes in this
  patch. Those remain separate investigations if the reported connection still fails after access
  is granted.

## Evidence and limits

The packaging regression loads the Electron Builder configuration through Electron Builder's own
configuration reader, then checks the resolved macOS `extendInfo` object for the usage description
and for the absence of `NSBonjourServices`. Formatting, documentation checks, and the affected test
suite are recorded in the pull-request handoff. This is configuration-level verification; it does
not package, sign, or launch a release build, trigger the privacy prompt on a separate Mac, or prove
that local-network privacy was the only cause reported in issue 592.

Apple reference: [TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).
