# ADR 0093: LaunchAgent Config-Only Secrets

## Status

Accepted

## Context

The Mac agent service installs a LaunchAgent plist. Earlier service installation
wrote relay configuration into the private Hovvi config and also embedded relay
token environment variables in the plist. The plist is private, but duplicating
credential material increases the number of places that need redaction,
rotation, and inspection.

The CLI already writes relay URL, relay token, service label, and device name to
the private Hovvi config before installing the service. `hovvi up` reads that
config when launchd starts the agent.

## Decision

LaunchAgent plists now include only `HOVVI_CONFIG` in their environment. Relay
URL, relay token, and device metadata stay in the private Hovvi config file.

`hovvi service install --relay ... --token ... --name ...` keeps accepting those
flags because they remain the user-facing way to populate config before the
service is installed.

## Consequences

- Relay tokens are no longer duplicated into launchd environment variables.
- Token rotation can update the private config without requiring plist
  regeneration for token-only changes.
- `hovvi service logs` redaction still handles old logs and older plists that
  may contain relay token environment variables.
- `hovvi service install --print` prints a plist that is safe to inspect without
  exposing relay token material.

## Validation

- `node --test test/service.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
