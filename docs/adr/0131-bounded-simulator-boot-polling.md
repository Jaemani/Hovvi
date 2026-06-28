# ADR 0131: Bounded Simulator Boot Polling

## Status

Accepted.

## Context

GitHub-hosted macOS CI reached `npm run ios:simulator-install-check` and then
remained inside the install step for several minutes while waiting for
CoreSimulator boot readiness. The prior harness used `xcrun simctl bootstatus
-b`, which can block inside CoreSimulator and delay or defeat the useful failure
signal.

The install gate must remain fail-closed, but CI should fail with a bounded,
diagnosable result instead of hanging.

## Decision

Replace blocking `simctl bootstatus -b` in the install check with bounded
polling of `xcrun simctl list devices --json`.

The harness now:

- boots the selected simulator;
- polls the selected UDID until its state is `Booted`;
- shuts down and retries once when the simulator never reaches `Booted`;
- reports the final simulator JSON as failure detail when boot never completes;
- keeps install and cleanup behavior unchanged.

## Validation

- Unit coverage verifies successful polling, bounded retry, and failure detail.
- Existing simulator install, launch, and screenshot-matrix tests remain part of
  the targeted verification gate.

## Consequences

CI no longer depends on a long blocking CoreSimulator bootstatus call for this
gate. Persistent simulator boot failure still fails before screenshot evidence
can be claimed, preserving the fail-closed simulator harness policy.
