# ADR 0022: Relay Datagram Lifecycle Fixtures

## Status

Accepted

## Context

After the local mosh-server probe proved real output, input, paste-sized input,
resize, and shutdown acknowledgement, the next reliability gap was datagram
channel lifecycle behavior.

The relay must not leak channel state when an agent/client disconnects or when a
datagram channel goes idle. The native transport path also needs fixture
coverage for mosh fragmentation behavior before mobile UI integration.

## Decision

Add relay-side stale datagram cleanup:

- `createRelayState` now tracks `datagramTimeoutMs`.
- `createRelayServer` sweeps stale datagrams alongside stale agents.
- `sweepStaleDatagrams` closes channels whose peer disconnected or whose
  `lastSeenMs` exceeds the timeout.
- relay status metrics include `staleDatagramsPruned`.

Add upstream transport fixture coverage for fragmented relay datagrams:

- `upstream_relay_transport_smoke` now sends a multi-fragment server
  instruction out of order.
- the client must not render incomplete fragment sets.
- rendering happens only after the missing fragment arrives and assembly
  completes.

## Rationale

Mosh's SSP layer can tolerate loss and reordering at the transport level, but
Hovvi's relay still owns channel lifetime and resource cleanup. These checks
separate those responsibilities:

- native transport tests cover encrypted mosh fragment assembly behavior
- relay tests cover opaque channel routing and lifecycle cleanup

## Consequences

- `npm test` covers relay datagram peer-disconnect and idle-timeout cleanup.
- `native:upstream-check` covers fragmented mosh transport instructions over
  Hovvi relay datagrams.
- A full relay + agent + client end-to-end mosh attach smoke remains the next
  integration milestone.
