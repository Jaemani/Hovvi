# ADR 0150: iOS Inbound Datagram Size Boundary

Date: 2026-06-28

## Status

Accepted

## Context

Relay datagram attach manifests carry `maxDatagramBytes` so the mobile mosh path
can reject packets that exceed the negotiated transport size. Swift already
enforced this limit before sending outbound packets, and the JavaScript relay
server also enforces channel limits before forwarding datagrams.

The iOS native attach boundary still needs defense in depth for inbound relay
datagrams. A malformed relay, stale channel, or protocol bug must not be able to
feed oversized packets into the mosh core simply because the relay-side check was
expected to catch them first.

## Decision

`MoshRelayDatagramSession.receivePacket` now checks inbound `datagram.data`
payload sizes against the session `maxDatagramBytes` before returning a packet to
the mosh engine.

When an inbound packet exceeds the negotiated limit, the session:

- clears its connected channel id,
- best-effort closes the relay datagram channel, and
- throws `MoshRelayDatagramSessionError.packetTooLarge(size:max:)`.

## Consequences

- Swift mobile attach fails closed on oversized inbound relay datagrams.
- The mosh engine receives only packets within the negotiated datagram limit.
- The existing outbound size limit and relay/server-side size checks remain
  unchanged.
- This does not change the relay wire format, attach manifest schema, native
  C ABI, or npm package contents.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`

## References

- `apps/ios/Sources/HovviMobileCore/MoshRelayDatagramSession.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- `docs/adr/0142-js-relay-client-datagram-size-limit.md`
- `docs/adr/0143-relay-datagram-size-boundary.md`
