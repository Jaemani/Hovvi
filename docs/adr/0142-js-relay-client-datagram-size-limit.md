# ADR 0142: Enforce JavaScript relay client datagram size before send

## Status

Accepted.

## Context

The relay datagram attach path carries opaque encrypted mosh packets between the
mobile/client side and the Mac agent UDP bridge. The roadmap requires datagram
size limits to be enforced before relay send. Swift `MoshRelayDatagramSession`
already rejects oversized packets before forwarding them to the relay client,
and the agent UDP bridge rejects oversized UDP payloads before socket writes.

The JavaScript relay client accepted `maxDatagramBytes` during
`openDatagram(...)`, but `channel.send(bytes)` serialized and sent any payload
size. That left the reusable JavaScript attach helper less strict than the
native mobile path and made oversized mosh packets visible to the relay before
the client-side contract failed.

## Decision

`createDatagramChannel` now stores the negotiated `maxDatagramBytes` for the
channel. `send(bytes)` converts the input to a `Buffer`, checks its byte length,
and throws `datagram exceeds maxDatagramBytes (size > max)` before serializing
or sending a `datagram.data` envelope.

This changes only the client-side API behavior. The relay wire format remains
unchanged.

## Consequences

- JavaScript relay datagram clients now match the Swift mobile fail-fast size
  contract.
- Oversized packets cannot be forwarded to the relay by this client API.
- Existing valid payloads are unaffected.
- The integration test keeps the channel usable after an oversized send fails,
  proving the failure is local and does not corrupt relay channel lifecycle.

## Verification

- `node --test test/integration-relay.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
