# ADR 0090: Scoped Token Listing

## Status

Accepted

## Context

Hosted relay operations need token listing that is useful after accounts,
devices, clients, and revocation state exist. A flat token list forces operators
to inspect unrelated registry entries and makes account-scoped rehearsals harder
to verify.

The listing path must remain read-only and must not expose raw token material or
stored token hashes.

## Decision

`listRegistryTokens` now accepts optional filters for account id, role, device
id, client id, and disabled state. `hovvi token list` exposes those filters as:

- `--account <account-id>`
- `--role agent|client|*`
- `--device <device-id>`
- `--client <client-id>`
- `--active`
- `--disabled`

Filters are combined as an intersection. `--active` and `--disabled` are
mutually exclusive. Device and client filters only match constrained tokens that
explicitly include the requested device or client id.

## Consequences

- Hosted-relay rehearsals can inspect scoped credentials without hand-editing
  the private registry JSON.
- Operators can distinguish active and revoked credentials without exposing
  hashes.
- This does not define paid hosted-relay retention, pricing, or data policy.
- Read-only listing still does not produce audit events.

## Validation

- `node --test test/cli-token.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
