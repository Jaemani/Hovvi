# ADR 0095: Registry Token Lifecycle Listing

## Status

Accepted

## Context

Registry token authentication already rejects disabled, not-yet-valid, expired,
and invalid-dated tokens. `hovvi token list` previously exposed only a boolean
active/disabled view, so operational users could not distinguish a usable token
from one that was time-bound but currently invalid.

Hosted relay rehearsals need lifecycle visibility without weakening token
validation or exposing token hashes.

## Decision

Registry token listing now computes a secret-free lifecycle `status` for each
token:

- `active`
- `disabled`
- `not-before`
- `expired`
- `invalid-not-before`
- `invalid-expires-at`

`hovvi token list --active` maps to `status=active`, `--disabled` maps to
`status=disabled`, and `--status <value>` can select any lifecycle status. Only
one status selector is accepted per command.

List output continues to omit raw token hashes and raw token values.

## Consequences

- Operators can find expired, pending, or malformed token entries before
  debugging relay authentication failures.
- `--active` now means currently usable rather than merely not disabled.
- Authentication behavior is unchanged; this is an observability and CLI
  filtering change only.

## Validation

- `node --test test/registry.test.js test/cli-token.test.js`
- `npm run check`
