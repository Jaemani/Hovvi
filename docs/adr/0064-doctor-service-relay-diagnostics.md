# ADR 0064: Doctor Service and Relay Diagnostics

## Status

Accepted

## Context

The Mac package needs to be reliable enough for repeated local and hosted use.
`hovvi doctor` already checks required commands, optional tools, Git identity,
GitHub CLI auth, and GitHub SSH. The roadmap also calls out service state and
relay reachability so users can diagnose why the mobile app does not see a Mac
without inspecting LaunchAgent internals or guessing whether the relay is
reachable.

Network checks should remain opt-in. A default doctor run should be fast and
should not connect to external or hosted services unless the user asks for
network validation.

## Decision

Extend `hovvi doctor` with two diagnostics:

- `launchd service`, checked on macOS through the existing LaunchAgent service
  status helper. Non-macOS hosts report a warning that LaunchAgent state is not
  available.
- `relay reachability`, checked only with `hovvi doctor --network`. The check
  opens a WebSocket to the configured relay URL and redacts URL credentials in
  diagnostic output.

When `--network` is not provided, relay reachability is reported as skipped. The
existing GitHub CLI and GitHub SSH checks remain gated behind `--network`.

## Consequences

- Users can distinguish "agent service is not loaded" from "relay is not
  reachable".
- Default doctor remains non-networked.
- Relay diagnostics do not send tokens or inspect encrypted mosh payloads.
- Hosted relay account policy remains separate; this only validates transport
  reachability for the configured URL.

## Validation

- `npm run check`
- `node --test test/doctor.test.js`
- `npm test`
