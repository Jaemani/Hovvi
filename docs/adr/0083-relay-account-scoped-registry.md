# ADR 0083: Relay Account-Scoped Registry

## Status

Accepted

## Context

The hosted relay milestone requires account/device registration and scoped
agent/client credentials. Before hosted OAuth and token issuance exist, the
relay still needs a deterministic authorization boundary that prevents one
account's client from listing or attaching to another account's Mac.

The existing registry already supported hashed tokens, roles, expiration,
revocation, and optional device/client binding, but it did not carry account
scope into relay routing decisions.

## Decision

Registry token entries may now include `accountId`.

Authenticated relay principals keep that account id. When a client principal is
account-scoped, the relay only exposes agents with the same account id and
blocks cross-account attach, forward, and datagram requests. Cross-account
requests use offline-style errors so the relay does not reveal whether another
account's device exists.

Unscoped dev-token behavior remains unchanged for local development.

The registry also exposes account and device upsert primitives so future hosted
registration workflows can persist account/device metadata without changing the
token file format again.

## Consequences

- Hosted relay work now has an executable account isolation contract.
- Account-scoped clients cannot list, attach to, forward to, or open datagrams
  against another account's agent.
- Local development remains compatible with the unscoped dev token.
- Future GitHub OAuth/device registration can issue tokens against the same
  `accountId` boundary.

## Validation

- `node --test test/registry.test.js test/relay.test.js`
- `npm test`
