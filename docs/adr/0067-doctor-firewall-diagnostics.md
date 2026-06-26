# ADR 0067: Add Read-Only macOS Firewall Diagnostics to Doctor

Date: 2026-06-27

## Status

Accepted

## Context

The Mac Agent and CLI hardening roadmap calls for `hovvi doctor` to cover common
firewall issues. Hovvi's relay-first attach path does not require users to open
inbound internet ports, but strict local macOS Application Firewall policy can
still affect local `mosh-server` UDP traffic on `127.0.0.1`.

## Decision

`hovvi doctor --network` now reads macOS Application Firewall global state using
`/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate`.

The check is intentionally:

- opt-in through `--network`, matching other potentially slower environment
  diagnostics;
- read-only, with no automatic firewall rule changes;
- macOS-specific, reporting "not checked" on other platforms;
- warning-only when the firewall is enabled or the state cannot be inspected.

## Consequences

- Users get a concrete diagnostic hint when relay reachability works but local
  mosh attach may be blocked by host firewall policy.
- Hovvi does not require privileged firewall mutation and does not change host
  security posture during `doctor`.
- Future service hardening can add more specific signed-binary or application
  rule checks once release artifacts exist.

## Validation

- `npm run check`
- `node --test test/doctor.test.js`
