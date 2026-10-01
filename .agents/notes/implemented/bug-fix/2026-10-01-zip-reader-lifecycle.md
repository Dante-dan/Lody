# ZIP reader lifecycle on supported Node releases

Status: implemented
Translation: current

[中文](2026-10-01-zip-reader-lifecycle.zh.md)

## Abstract

ACP ZIP installation could stop before the end of a compressed entry on Node 24.16. Issue #1185 isolates the failure in the existing extractor with yauzl 2.10.0. Upgrade the CLI to yauzl 3.4.0, whose bundled reader implements the native stream destruction lifecycle, and retain the extractor's cancellation and reader-close fence. A regression in the owning suite drains a deterministic 8 MiB deflated entry and verifies the final archive entry. The issue's Linux environment and full released CLI were not exercised locally.

## Decision and evidence

[Issue #1185](https://github.com/LodyAI/Lody/issues/1185) reports an 8,386,048-byte partial output from an 8,388,608-byte input on Node 24.16, versus completion on Node 22.22.3. [yauzl #170](https://github.com/thejoshwolfe/yauzl/pull/170) fixes reader destruction through `_destroy` instead of overriding the public stream `destroy` method. Use the maintained upstream implementation instead of patching Node internals or adding extraction timeouts. No runtime download channel, traversal checks, or independent consumer cancellation semantics change.

The existing abortable relay remains the consumer boundary and reader close/error remains the scratch cleanup fence. Completion coverage extends the existing ZIP suite; cancellation, writer failure, reader close failure, and path rejection remain covered there. The corrected owning suite passes seven tests under Node 22.16, Node 24.12, and Node 24.16 on macOS arm64 with yauzl 3.4.0. Under the same actual Node 24.16 runtime, yauzl 2.10.0 times out at compressed-entry completion after 30 seconds (six existing tests pass); yauzl 3.4.0 passes all seven in 3.38 seconds. The same suite also passes with yauzl 2.10.0 under Node 24.12, so the Node 24.12 comparison establishes compatibility; the Node 24.16 comparison establishes the regression and fix. An initial 8 MiB Buffer deep-equality assertion was too expensive and its timeout is not defect evidence; length and SHA-256 comparison replace it. Full check outcomes are reported with the contribution. Node 24.16 Linux and a packaged ACP installation remain verification limits.
