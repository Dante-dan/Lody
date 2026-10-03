# Linux icon assets

Status: proposed
Translation: current

[中文](2026-10-03-linux-icon-assets.zh.md)

## Abstract

Issue [#178](https://github.com/LodyAI/Lody/issues/178) reports a generic GNOME icon and identifies a single-size packaging icon plus a window-identity mismatch. This reference change addresses only the asset branch: Linux receives seven pre-sized PNGs derived from the existing artwork, with a before-pack guard that prevents silent macOS-icon fallback. Application naming, data paths and keyring identity remain unchanged because a rename has compatibility consequences. This does not claim that the original Ubuntu taskbar scenario is fixed; window identity remains a separate question.

## Decision and evidence

`electron-builder.yml` currently points Linux at a 512-pixel PNG. The issue's package inspection reports only that size in the hicolor directory. A directory of 16, 32, 48, 64, 128, 256 and 512-pixel files makes the intended size set explicit. These committed assets were resized from `apps/electron/build/icon.png` using Pillow LANCZOS, without changing artwork. The packaging hook verifies PNG signatures and dimensions before native staging.

Changing `app.setName` to the desktop ID could affect Electron defaults and Chromium keyring identity. This independent asset slice avoids that migration and does not alter approved product intent. Maintainer acceptance is pending.

## Validation

The owning Node test checks the shipped asset set and rejects missing, mismatched and invalid PNGs. Linux package probes and the reported GNOME desktop scenario require a Linux packaging environment; they are not claimed as passed.

Local checks: the two icon-guard tests passed; `pnpm format` and `pnpm run docs check` passed. `pnpm check` failed while compiling the ACP Claude submodule, before the root checks reached this change. The full Electron suite completed with 10 failures; these results are preserved locally and are not reported as passed.
