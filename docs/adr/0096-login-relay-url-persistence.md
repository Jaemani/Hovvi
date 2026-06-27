# ADR 0096: Login Relay URL Persistence

## Status

Accepted

## Context

`hovvi login --registry --issue-token agent|client` can issue scoped relay
tokens and save the raw token only in the private local config. The relay URL
still had to be supplied later through `hovvi service install --relay ...`,
`hovvi up --relay ...`, or manual config editing.

For hosted-relay rehearsals, the login flow should leave the private config
ready for agent/client startup without extra relay URL copying.

## Decision

`hovvi login` now accepts `--relay <url>`. When provided, the URL is saved to
`config.relay.url` before any issued token is merged into `config.relay`.

The command prints the saved relay URL with embedded URL credentials redacted.
It never prints issued relay token values, token hashes, or the GitHub OAuth
access token.

## Consequences

- Agent and client private config can be prepared in one login/token issuance
  command.
- Existing explicit `hovvi up --relay ...` and `hovvi service install --relay
  ...` flows remain supported.
- This does not select hosted relay pricing, retention, or data policy; it only
  stores a caller-provided relay endpoint.

## Validation

- `node --test test/cli-token.test.js`
- `npm run check`
