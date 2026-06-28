# ADR 0143: Enforce relay datagram size at the relay boundary

## Status

Accepted.

## Context

ADR 0142 made the JavaScript relay client reject oversized datagram payloads
before sending them, matching the Swift mobile and Mac agent UDP bridge
contracts. The relay server still accepted any schema-valid `datagram.data`
message from either peer and forwarded it without comparing the decoded payload
size with the channel's `maxDatagramBytes`.

That left the WebSocket relay boundary dependent on well-behaved clients and
agents. Hovvi's relay-first mosh path should fail closed when custom,
outdated, or malicious peers ignore the advertised datagram limit.

## Decision

`datagram.open` now stores the channel's effective `maxDatagramBytes` in relay
state. For every inbound `datagram.data`, the relay decodes the base64 payload
length and compares it with the channel limit before forwarding.

If the payload is too large:

- the relay does not forward the data;
- the sender receives `datagram.error` with the size-limit reason;
- the peer receives `datagram.close`;
- the relay deletes the channel state and records a close log with
  `reason: "max_datagram_bytes"`.

The wire format remains unchanged.

## Consequences

- The relay no longer trusts client-side size checks.
- Oversized datagrams from either the client side or agent side close the relay
  channel deterministically.
- Valid datagram routing remains unchanged.
- The relay still treats the mosh payload as opaque encrypted data; only decoded
  byte length is inspected.

## Verification

- `node --test test/relay.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
