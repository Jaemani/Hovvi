# ADR 0020: Upstream Relay Transport Slice

## Status

Accepted

## Context

ADR 0019 proved local `mosh-server` bootstrap and the UDP relay-datagram
boundary. The next technical gap is upstream mosh's transport layer:

- `Network::Transport` owns a socket-backed `Network::Connection`.
- `TransportSender` sends through `Connection*` directly.
- Hovvi must not modify vendored upstream mosh files without an explicit
  decision gate.

The previous C ABI slice handled encrypted `Network::Packet` payloads and
terminal/user state diffs, but it did not exercise the mosh SSP
`TransportInstruction` and fragmentation layer that a real `mosh-server` uses.

## Decision

Add a repository-only upstream relay transport slice:

- `native/mosh-core/src/hovvi_mosh_relay_transport_upstream.h`
- `native/mosh-core/tests/upstream_relay_transport_smoke.cc`

This slice uses upstream crypto, `Network::Packet`, `TransportInstruction`,
`Fragmenter`, `FragmentAssembly`, `UserStream`, and `Terminal::Complete`, but
sends and receives opaque encrypted datagrams through Hovvi
`RelayDatagramEndpoint`.

The file is intentionally under `native/mosh-core/src/` and is not included in
the npm package allowlist. It is validated only by `native:upstream-check`.

## Rationale

This moves the native path one level closer to real mosh-server compatibility
without editing vendored upstream files and without claiming the full
socket-free `Network::Transport` replacement is complete.

The smoke test proves:

- client input becomes a mosh protocol-versioned `TransportInstruction`
- upstream fragmentation and packet encryption survive the relay datagram
  boundary
- server terminal diffs can be received, assembled, applied, and rendered
- resize diffs acknowledge the last received server state
- invalid encrypted relay datagrams surface as crypto errors

## Consequences

- `native:upstream-check` now covers relay-backed mosh transport instructions,
  not only packet-level encryption and terminal ABI slices.
- The current npm package still excludes GPL vendored source and GPL-linked
  upstream transport code.
- Full macOS harness acceptance still requires connecting this transport slice
  to a real local `mosh-server` UDP path and then driving input, resize, paste,
  output, and shutdown through native frames.
