# ADR 0012: Native Packet IO Seam

## Status

Accepted

## Context

ADR 0011 found that upstream `Network::Transport` cannot be tested over in-process relay queues directly because it owns socket-backed `Connection` instances. Hovvi needs a stable packet IO boundary before replacing UDP send/receive with relay datagrams.

## Decision

Add a Hovvi-owned packet IO seam under `native/mosh-core/adapter`.

The first implementation is `InProcessPacketChannel`, a deterministic bidirectional datagram queue used by native smoke tests. It preserves packet boundaries and ordering but does not perform crypto, protobuf serialization, retransmission, or socket IO.

`native:adapter-check` builds this MIT-owned adapter smoke separately from `native:upstream-check`. The npm package may include this adapter code because it does not link or copy GPL upstream mosh source.

## Rationale

Keeping the packet IO seam Hovvi-owned lets the mobile app and relay adapter evolve without exposing Swift/Kotlin code to upstream C++ class layout. It also gives future work a concrete target for replacing `Connection::send`/`recv` with relay-backed datagram IO.

## Consequences

- The adapter seam is not the mosh protocol implementation; it is the transport boundary where upstream packet bytes will later flow.
- The next native slice should connect upstream packet encode/decode to `PacketEndpoint` without opening UDP sockets.
- `native:check`, `native:adapter-check`, and `native:upstream-check` stay separate so shipped ABI, Hovvi-owned adapter code, and GPL-linked upstream checks remain auditable.
