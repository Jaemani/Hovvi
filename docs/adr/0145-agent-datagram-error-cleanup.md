# ADR 0145: Agent Datagram Error Cleanup

## Status

Accepted

## Context

ADR 0143 made the relay fail closed when either endpoint sends a datagram larger
than the channel's `maxDatagramBytes`. The relay deletes the channel, sends
`datagram.error` to the sender, and sends `datagram.close` to the peer.

The JavaScript relay client already treats `datagram.error` as terminal for an
opened channel. The Mac agent, however, only closed local UDP bridges on
`datagram.close`. Also, when the agent-side UDP bridge rejected an oversized
client payload before writing to the UDP socket, it emitted `datagram.error` but
kept the local bridge open. That left room for relay-side teardown to be correct
while agent-local bridge state remained stale.

## Decision

The Mac agent treats `datagram.error` as a terminal relay message for the local
UDP bridge, using the same cleanup path as `datagram.close`.

The agent-side UDP bridge closes itself after local oversize rejection emits
`datagram.error`. `createUdpDatagramBridge` now accepts an `onClose` callback so
the agent can remove the bridge from its channel map when the bridge closes
because of local rejection, socket error, relay close, relay error, or agent
shutdown.

## Consequences

- Relay and agent datagram lifecycle semantics now match: `datagram.close` and
  `datagram.error` are terminal for an active channel.
- Oversized packets cannot leave a stale agent-local UDP bridge after the relay
  deletes channel state.
- The wire format is unchanged.
- Tests cover both the UDP bridge local oversize close and the agent's
  `datagram.error` cleanup behavior.
