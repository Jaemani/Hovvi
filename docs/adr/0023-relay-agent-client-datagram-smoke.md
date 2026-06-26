# ADR 0023: Relay Agent Client Datagram Smoke

## Status

Accepted

## Context

ADR 0022 covered relay-side datagram lifecycle cleanup and native in-process
fragment behavior. The next relay integration gap was whether a real Hovvi
client can open a datagram channel through the relay to an agent-owned UDP
target without relying on raw WebSocket test shortcuts.

The mobile attach shell will need a stable client-side datagram API. Testing
only `datagram.open` JSON messages would leave that API boundary undefined.

## Decision

Add a public relay client datagram channel API:

- `createClient().openDatagram(...)`
- channel `send(bytes)`
- channel `nextMessage({ timeoutMs })`
- channel `close()`

Export `connectAgent` so integration tests can run the real agent message
handlers and UDP bridge without starting the infinite CLI reconnect loop.

Add an integration smoke that starts:

- a local UDP echo server bound to `127.0.0.1`
- the Hovvi relay server
- a real Hovvi agent connection
- a real Hovvi client connection

The client opens a datagram channel, sends `ping`, receives `echo:ping`, closes
the channel, and verifies relay datagram state is released.

## Rationale

This keeps the relay integration milestone aligned with the product boundary:
mobile code should consume a client API, not hand-roll relay protocol details.
The test still treats datagram payloads as opaque bytes, preserving the mosh
compatibility boundary.

## Consequences

- `npm test -- test/integration-relay.test.js` now covers relay + agent +
  client datagram round trip through a real UDP bridge.
- The relay datagram client API is intentionally minimal until the native mosh
  engine consumes it directly.
- This does not include, link, or package GPL mosh source in npm artifacts.
- A full mosh attach smoke through the relay remains pending until the native
  core is wired to this client channel.
