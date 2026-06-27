# ADR 0099: LaunchAgent Config Path Diagnostics

## Status

Accepted

## Context

LaunchAgent plists carry only one runtime environment variable: `HOVVI_CONFIG`.
That keeps relay tokens out of launchd, but it also makes the plist config path
a critical part of service correctness.

After service install began passing the active `HOVVI_CONFIG` path into the
plist, Hovvi needed a durable diagnostic so future drift is visible instead of
silently starting an agent with a stale private config.

## Decision

Service status now parses the installed LaunchAgent plist and reports the
configured `HOVVI_CONFIG` path when present.

`hovvi doctor` compares that LaunchAgent config path with the active CLI
`HOVVI_CONFIG` path and warns when they differ. The diagnostic contains only
filesystem paths, not relay tokens, token hashes, relay URLs, or mosh keys.

## Consequences

- Users can see which private config the LaunchAgent will use.
- Config-path drift is caught before debugging relay authentication or missing
  device registration.
- Secret handling remains config-only; no credential material is added back to
  the plist.

## Validation

- `node --test test/service.test.js test/doctor.test.js`
- `npm run check`
