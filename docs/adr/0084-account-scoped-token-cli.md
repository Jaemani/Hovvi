# ADR 0084: Account-Scoped Token CLI

## Status

Accepted

## Context

Hosted relay development needs account-scoped agent and client credentials before
the GitHub OAuth issuance flow is complete. The registry supports the needed
fields, but operators still had to hand-edit JSON to add `accountId`,
`deviceIds`, `clientIds`, or validity windows.

Hand-editing token registry JSON is error-prone and weakens traceability for the
hosted account milestone.

## Decision

`hovvi token generate` and `hovvi token hash` now accept:

- `--name`
- `--account`
- `--device` (repeatable or comma-separated)
- `--client` (repeatable or comma-separated)
- `--not-before`
- `--expires-at`

When `--registry` is provided, the command appends the generated registry entry
to that private registry file and rejects duplicate token names. The JSON output
still prints the raw token only for `generate`; list output never prints token
hashes or raw token values.

## Consequences

- Account-scoped relay credentials can be created without manual registry edits.
- Device and client binding can be tested with the same CLI path operators will
  use for local hosted-relay rehearsals.
- Raw token exposure stays limited to the `generate` command's one-time output.
- OAuth/device registration can later call the same registry-entry shape.

## Validation

- `node --test test/cli-token.test.js test/registry.test.js test/relay.test.js`
- `npm test`
