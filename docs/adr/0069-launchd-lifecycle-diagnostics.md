# ADR 0069: Surface LaunchAgent Lifecycle Diagnostics

Date: 2026-06-27

## Status

Accepted

## Context

The Mac Agent and CLI hardening roadmap requires LaunchAgent install/start/
status/logs hardening. `hovvi service status` and `hovvi doctor` could
previously distinguish loaded from not loaded, but a loaded service can still be
unhealthy if launchd is repeatedly restarting it, it is waiting after a non-zero
exit, or it is throttled.

## Decision

Parse selected fields from `launchctl print` output in the service layer:

- `state`
- `pid`
- `last exit code`
- `last termination reason`
- `throttle interval`

`hovvi service status` prints a compact lifecycle summary when those fields are
available. `hovvi doctor` treats a loaded service with a non-zero last exit code
or non-running state as warning-worthy instead of reporting it as simply loaded.

## Consequences

- Users can distinguish "LaunchAgent is loaded" from "LaunchAgent is loaded but
  unhealthy."
- The check remains read-only and does not mutate launchd state.
- The parser is intentionally conservative. Unknown `launchctl print` fields are
  ignored, and unsupported output falls back to the existing loaded/not-loaded
  behavior.

## Validation

- `npm run check`
- `node --test test/service.test.js test/doctor.test.js`
