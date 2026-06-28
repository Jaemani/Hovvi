# ADR 0128: Relay Credential Validation

## Status

Accepted

## Context

Mac-side relay commands previously checked that relay URL and token values
existed, but not that the URL was usable for WebSocket relay transport or that
the development token stayed local. This left room for invalid LaunchAgent
configuration and accidental remote use of the local `dev` token.

The iOS alpha bootstrap already fails closed for malformed relay URLs and
non-local development fallback credentials. The Mac agent and CLI need the same
boundary before hosted login fully replaces local bootstrap credentials.

## Decision

Add a shared relay credential validator for JavaScript CLI and service code.

The validator requires:

- relay URLs must parse as absolute `ws://` or `wss://` URLs with a host.
- the `dev` relay token is valid only for loopback relays:
  `localhost`, `127.0.0.1`, or `::1`.
- remote relays require a non-development token.
- diagnostics redact URL credentials before reaching doctor or thrown errors.

`hovvi up`, device/session attach client commands, local forwarding, service
install/start/restart, and `hovvi doctor` now share this policy.

## Consequences

- A clean local relay flow still works with `ws://127.0.0.1:8787` and `dev`.
- Remote/self-hosted relay use must provide an account-scoped or operator-issued
  token instead of falling back to `dev`.
- Bad service config fails before launchd start instead of entering a restart
  loop.
- This does not choose hosted relay pricing, retention, data policy, or mobile
  app distribution policy.

## Validation

- `node --test test/relay-credentials.test.js test/service.test.js test/doctor.test.js test/cli-token.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
