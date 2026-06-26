# ADR 0013: Relay Datagram Packet Adapter

## Status

Accepted

## Context

ADR 0012 introduced a Hovvi-owned in-process packet IO seam. The next roadmap
step is to connect upstream mosh packet bytes to a relay/datagram boundary
without opening UDP sockets and without exposing upstream C++ classes to Swift.

Upstream `Network::Connection` still owns sockets directly. Hovvi therefore
needs a smaller testable boundary before replacing the full connection loop.

## Decision

Add `RelayDatagramEndpoint` under `native/mosh-core/adapter`.

The adapter wraps a `PacketEndpoint` and enforces a maximum datagram size before
send. It reports explicit statuses for success, empty receive, disconnected
peer, and oversize datagrams.

Extend native checks with two layers:

- `native:adapter-check` validates the Hovvi-owned relay datagram behavior
  without linking upstream mosh.
- `native:upstream-check` adds an upstream-linked smoke that encrypts
  `Network::Packet` values with upstream `Crypto::Session`, sends the encrypted
  bytes through `RelayDatagramEndpoint`, decrypts them on the other side, and
  reconstructs `Network::Packet`.

## Rationale

This proves the first relay-backed mosh data path while keeping ownership and
license boundaries clear. Hovvi-owned adapter code can ship in the MIT npm
package; the upstream-linked smoke remains a repository/CI validation target.

The test intentionally stays below `Network::Connection` and `Network::Transport`
because those classes still couple packet send/receive to socket ownership.

## Consequences

- Hovvi now has a deterministic in-process relay datagram primitive with size
  enforcement and explicit failure statuses.
- Upstream packet serialization and AES-OCB encryption can move through that
  primitive without UDP sockets.
- This is not yet a full mosh transport loop. Retransmission, ack, prediction,
  terminal state sync, and shutdown still need the upstream-backed C ABI engine
  milestone.
