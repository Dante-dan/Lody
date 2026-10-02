# Remote daemon lifecycle acknowledgements

Status: draft
Translation: current

[中文](machine-lifecycle-ack.zh.md)

## Accepted work and response delivery

An authorized restart or upgrade that the CLI has accepted must proceed even when
its acknowledgement cannot be delivered. Upgrade acceptance still requires the
existing upgrade intent to be written successfully. Rejected operations never
trigger a lifecycle exit.

The RPC server first attempts to deliver the accepted response, with a total
five-second budget. Success, exhausted delivery retries, or deadline expiry then
invoke the existing CLI lifecycle callback. An ACK delivery error is diagnostic;
it must not produce a contradictory operation-failed response. Late completion of
that attempt must not invoke the callback again.

The existing process boundary retains its one-time exit guard. This contract does
not add process-wide preparation serialization or restart-request deduplication.
The deadline bounds waiting, not cancellation of the underlying HTTP request.
A client timeout means the outcome is unconfirmed; it does not cancel accepted work
or prove that the daemon failed to restart or upgrade. Completion reporting is separate.

## Upgrade replay handling

After authorization, an exact target equal to the running CLI version returns a
successful response without accepting another process exit. `latest` cannot use
this comparison because its resolved version is unknown to the Worker.

Before accepting an upgrade, the Worker records the requester and request ID in
its installation-profile data directory. The installer marks that receipt as
attempted before starting npm. A prepared receipt admits the installer once; a
redelivered request never authorizes another process exit. Attempts survive Worker and watchdog
restarts for 25 hours, covering the Machine RPC stream's 24-hour retention window.
An interrupted or failed installation counts as an attempt. If that request is
redelivered while the target is not running (including `latest`), it returns an
error explaining how to check the daemon path and npm prefix and retry explicitly
with a new request. Rejected replay never schedules another lifecycle exit.
Receipt read/write errors fail preparation or installation instead of installing
without replay protection.

For a conventional npm global installation, the installer derives the prefix
from the real daemon launch entry instead of trusting a different ambient npm
prefix. Other layouts keep npm's existing prefix selection. After npm succeeds,
a bounded `--version` probe of that same launch entry must return the exact target
before the installer permits watchdog handoff. An invalid, failed, or mismatched
probe reports an actionable installation-path error and leaves the receipt intact
so the same request cannot install again. For `latest`, the probe validates a
version but cannot establish the unresolved registry target.

This verifies the entry before handoff, not the newly running Worker. It does not
resolve `latest`, repair custom/npx installation layouts, or provide
permanent exactly-once execution after the retention window. The local clock owns
receipt expiry. A request with a new ID can retry a failed attempt. The intended
behavior above remains a draft requiring human review.

## Implementation evidence

- [RPC acknowledgement handling](../packages/loro-streams-rpc/src/machine-rpc-server.ts)
- [CLI callback wiring](../apps/cli/src/lib/message-handler.ts)
- [Process exit boundary](../apps/cli/src/commands/start.ts)
- [Synthetic transport tests](../packages/loro-streams-rpc/tests/machine-rpc-server.test.ts)
- [Upgrade attempts and installer](../apps/cli/src/lib/machine-lifecycle.ts)
- [Installer replay regressions](../apps/cli/src/lib/machine-lifecycle-upgrade.test.ts)
