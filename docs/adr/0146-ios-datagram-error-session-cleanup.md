# ADR 0146: iOS Datagram Error Session Cleanup

## Status

Accepted

## Context

ADR 0143 and ADR 0145 make relay and Mac agent datagram errors terminal for a
channel. JavaScript clients also close their local datagram channel when a
`datagram.error` arrives.

The iOS attach path uses `MoshRelayDatagramSession` above the Swift
`RelayClient`. If the relay reports `datagram.error` while the mosh session is
receiving, the session must not keep a stale channel id and later send packets
into a channel the relay has already deleted.

## Decision

`MoshRelayDatagramSession.receivePacket` now treats
`RelayClientError.datagramFailed` as terminal for the active channel. It clears
the connected channel id and rethrows the original relay error so UI recovery
can still show the appropriate, redacted failure reason.

## Consequences

- iOS mosh attach lifecycle now matches the relay, Mac agent, and JavaScript
  client terminal datagram error semantics.
- After a relay datagram error, later `sendPacket` calls fail immediately with
  `MoshRelayDatagramSessionError.notConnected` instead of sending to stale
  relay state.
- The relay wire format is unchanged.
- `HovviMobileCoreSmoke` covers the terminal error path, original error
  preservation, channel-id cleanup, and stale-send rejection.
