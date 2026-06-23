# ADR 0005: GitHub OAuth and Device Trust

## Status

Accepted

## Decision

Hovvi starts with GitHub OAuth device flow for CLI login and mobile login. Devices register with stable device ids. Self-hosted and development relays can use hashed registry tokens until the hosted account service issues scoped device credentials.

## Rationale

The first audience is developers. GitHub identity is expected, easy to explain, and fits both CLI and mobile sign-in.

## Consequences

- `hovvi login` requires a GitHub OAuth app client id.
- Development relay auth can use `HOVVI_RELAY_TOKEN`; hosted relay auth must move to scoped, expiring device credentials.
- Device revocation and audit trails must exist before a public hosted relay.
