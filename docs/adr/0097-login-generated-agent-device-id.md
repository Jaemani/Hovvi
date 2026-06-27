# ADR 0097: Login-Generated Agent Device IDs

## Status

Accepted

## Context

Agent relay tokens are scoped to device ids so revoked or mismatched devices
cannot appear online under another account/device identity. Earlier
`hovvi login --registry --issue-token agent` required the user to choose
`--device <device-id>` manually before the CLI could issue the token.

That extra identifier choice is setup friction and conflicts with the product
goal of login-based onboarding without manual config editing.

## Decision

When issuing an agent token, `hovvi login` now resolves the device id in this
order:

1. Explicit `--device <device-id>`.
2. Existing `config.device.id`.
3. A newly generated `dev_<random>` id.

The resolved id is written to private config, registered in the registry device
record, and used as the device scope for the issued agent token.

## Consequences

- New Mac setup can issue an agent token without manually inventing a device id.
- Existing configured agents keep stable device identity across token refreshes.
- Device-scoped auth is not weakened; generated ids are still stored and bound
  before the agent token is usable.

## Validation

- `node --test test/cli-token.test.js`
- `npm run check`
