# Bound ACP terminal output drain after command exit

Status: proposed
Translation: current

[中文](2026-10-06-acp-terminal-exit-drain.zh.md)

## Abstract

A shell command can exit while a background descendant still holds its stdout or
stderr open. Waiting only for Node's `close` event then keeps ACP terminal waits
pending for the descendant's lifetime. The proposed fix records `exit`, waits for
`close` or a 100 ms drain deadline, and reports the original command status once.
It preserves ordinary trailing output but deliberately does not wait for complete
background-job output or terminate those jobs.

## Evidence and ownership

[Issue #1270](https://github.com/LodyAI/Lody/issues/1270) reports `sleep 30 &`
exiting in about 6 ms while the terminal wait takes 30 seconds. These timings
are the reporter's evidence, not measurements from this change. The
[ACP terminal contract](https://agentclientprotocol.com/protocol/v1/terminals#waiting-for-exit)
responds when the command exits. `SessionProcessHandle` already buffers and replays
both lifecycle events, so the fix belongs in `ShellTerminalManager`, not in the
shared sandbox's process lifetime or termination logic. This complements the
[unsplit-command fix](../../implemented/bug-fix/2026-09-12-acp-terminal-unsplit-command-line.md)
without changing its spawn-error behavior.

## Decision and trade-offs

Start the drain deadline on `exit`; `close` finishes it early. A one-shot guard
retains the command's exit code/signal and runs resource-limit inspection once.
Disposing the terminal unsubscribes both events and clears the timer. Stream
listeners and the bounded terminal buffer remain available until release.

Reporting directly on `exit` risks dropping output already in flight. Waiting
indefinitely on `close` reproduces the reported hang. A 100 ms deadline bounds
this compromise; it is a scheduling allowance rather than a full descendant
output guarantee. Resource-limit inspection keeps its existing asynchronous
behavior and may still delay reporting independently of stdio drainage.

## Verification

The owning terminal suite adds deterministic event/fake-timer coverage for an
exit without close, trailing output during drain, close before the deadline, and
preserving the exit status when close arrives later. Existing real-process tests
cover ordinary output and failed spawning. No wall-clock sleep race is added.
The exact checks and outcomes accompany the reference commit. The reporter's
background-server scenario and a Linux resource-limited sandbox have not been
reproduced on a live agent.
