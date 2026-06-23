# ADR 0005: GitHub OAuth and Device Trust

## Status

Accepted

## Decision

Hovvi starts with GitHub OAuth device flow for CLI login and mobile login. Devices register with stable device ids and relay tokens during development.

## Rationale

The first audience is developers. GitHub identity is expected, easy to explain, and fits both CLI and mobile sign-in.

## Consequences

- `hovvi login` requires a GitHub OAuth app client id.
- Development relay auth uses `HOVVI_RELAY_TOKEN`; production must replace this with scoped, expiring device credentials.
- Device revocation and audit trails must exist before a public hosted relay.
