# ADR 0088: Registry Device Revocation

## Status

Accepted

## Context

The hosted relay roadmap requires devices to be scoped to an account and
revocable. Token revocation already existed, but an account device record could
not be disabled independently from its agent token. That made local hosted-relay
rehearsals weaker than the intended account/device lifecycle.

## Decision

Add registry device revocation:

- `revokeRegistryDevice(registry, { accountId, deviceId })`
- `hovvi device revoke --registry <path> --account <account-id> --device <device-id>`

Device list output now exposes active/disabled status. Agent authentication for
account-scoped registry tokens checks matching device records and rejects a
disabled device with `device_revoked`. Devices without a registry record remain
allowed unless the token itself has a `deviceIds` allow-list; this preserves the
existing local registry migration path.

## Consequences

- Operators can revoke a device without revoking every token for that account.
- Revoked devices cannot appear online through the relay with account-scoped
  agent credentials.
- Device revocation does not choose hosted retention, billing, or deletion
  policy.

## Validation

- `node --test test/registry.test.js test/relay.test.js test/cli-token.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
