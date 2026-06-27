# ADR 0094: Doctor Relay Config Diagnostics

## Status

Accepted

## Context

LaunchAgent plists now point only at the private Hovvi config file. Relay URL
and relay token material are no longer duplicated into launchd environment
variables.

That improves secret handling, but it also makes the private config the single
startup source for unattended agents. A missing relay URL or token can make the
service fail after installation, and the failure must be visible without asking
users to inspect private JSON or logs that may contain secrets.

## Decision

`hovvi doctor` now reports a `relay config` diagnostic on every run. The check
reads the private Hovvi config and verifies that `relay.url` and `relay.token`
are present for config-only LaunchAgent startup.

The diagnostic redacts credentials embedded in the relay URL and reports only
`token=present` for configured tokens. It never prints raw relay token values or
token hashes.

Relay WebSocket reachability remains behind `hovvi doctor --network`; this
change only verifies local config shape and secret-safe diagnostics.

## Consequences

- Missing config for unattended LaunchAgent startup is visible before service
  start.
- `hovvi doctor` remains safe to paste into support issues because relay token
  values are not emitted.
- Local development can still use explicit `hovvi up --relay ... --token ...`;
  the warning is scoped to private config readiness for the service path.
- Hosted login can later replace manual `service install --relay ... --token
  ...` without changing the doctor diagnostic contract.

## Validation

- `node --test test/doctor.test.js`
- `npm run check`
