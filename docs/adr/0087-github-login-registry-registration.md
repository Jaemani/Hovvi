# ADR 0087: GitHub Login Registry Registration

## Status

Accepted

## Context

The hosted relay roadmap chooses GitHub OAuth device registration unless a later
ADR replaces it. Hovvi already has a local GitHub device login command and
private registry account/device records, but the two paths were disconnected.

Hosted registration needs a stable account identifier that survives GitHub login
renames and does not depend on user-entered account ids.

## Decision

`hovvi login --registry <path>` now upserts the authenticated GitHub user into
the registry as `github:<numeric-user-id>` with the GitHub login as the default
display name. `--account-name` can override the display name for local hosted
relay rehearsals.

When `--device <device-id>` is provided, the command also upserts a device record
under the same account id, with optional `--device-name` and `--platform`.

The command still saves the GitHub access token only in the private Hovvi config
file and does not print the token, relay token hashes, or raw relay tokens.

## Consequences

- GitHub OAuth login now produces the same account/device registry shape that
  later hosted issuance can use.
- Account ids are stable across GitHub login renames because they use the
  numeric GitHub user id.
- This does not choose hosted retention, billing, or token issuance policy.

## Validation

- `node --test test/cli-token.test.js test/github-auth.test.js test/registry.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
