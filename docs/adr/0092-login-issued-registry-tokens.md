# ADR 0092: Login-Issued Registry Tokens

## Status

Accepted

## Context

Hosted relay rehearsals should move toward login-based setup instead of manual
relay token copy/paste. `hovvi login --registry` already connects GitHub OAuth
identity to account and device registry records, but relay credentials still had
to be generated through separate token commands.

This slice must not define hosted pricing, retention, paid plan, or production
credential policy. It also must not print relay tokens or token hashes.

## Decision

`hovvi login --registry` now accepts `--issue-token agent|client`.

For client tokens:

- `--relay-client <client-id>` sets the client scope.
- When omitted, a deterministic GitHub-account-derived local client id is used.
- The registry stores only the token hash, account id, client id scope, role,
  optional token name, and optional expiry.
- The raw relay token is saved to the private local Hovvi config.

For agent tokens:

- `--device <device-id>` is required.
- The registry stores only the token hash, account id, device id scope, role,
  optional token name, and optional expiry.
- The raw relay token and device id are saved to the private local Hovvi config.

Audit events reuse the registry token-generation event shape and redaction.

## Consequences

- Local hosted-relay rehearsals can move from GitHub login to scoped relay
  credentials in one command.
- Raw relay tokens remain local private config material and are not printed to
  stdout or audit logs.
- Duplicate token names are rejected before replacing local config credentials.
- This remains a local registry rehearsal, not a hosted account-service token
  issuance policy.

## Validation

- `node --test test/cli-token.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
