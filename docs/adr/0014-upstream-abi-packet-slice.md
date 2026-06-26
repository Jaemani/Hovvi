# ADR 0014: Upstream ABI Packet Slice

## Status

Accepted

## Context

The roadmap calls for an upstream-backed C ABI engine. The full engine must
eventually connect upstream terminal state sync, input, resize, ticks, and
shutdown. That is too large to land safely in one step.

ADR 0013 proved encrypted upstream `Network::Packet` values can move through
Hovvi relay datagram endpoints without UDP sockets. The next smallest useful
slice is to hide upstream key/session/decrypt/packet parsing behind
`hovvi_mosh_core.h`.

## Decision

Add `native/mosh-core/src/hovvi_mosh_core_upstream.cc` as a repository-only,
GPL-linked native validation implementation of the C ABI.

This slice supports:

- `hovvi_mosh_core_create` with upstream `Crypto::Base64Key` and
  `Crypto::Session`
- `hovvi_mosh_core_receive_packet` decrypting an inbound encrypted datagram and
  reconstructing upstream `Network::Packet`
- explicit `HOVVI_MOSH_CRYPTO_ERROR` for invalid ciphertext
- explicit `HOVVI_MOSH_PROTOCOL_ERROR` for packets directed to the server on
  the mobile receive path

This slice intentionally leaves input, resize, tick, and shutdown unavailable
until upstream state sync and terminal semantics are linked.

## Packaging Boundary

The npm package must continue to ship only the unavailable MIT scaffold. The
package file list therefore includes
`native/mosh-core/src/hovvi_mosh_core_unavailable.c` explicitly instead of the
whole `native/mosh-core/src` directory.

## Rationale

This gives the ABI a real upstream-backed success path without pretending the
terminal engine is complete. It also validates key parsing, decrypt errors, and
direction checks at the exact C ABI boundary that Swift will consume later.

## Consequences

- `native:upstream-check` now verifies an upstream-backed ABI smoke in addition
  to isolated crypto, network, packet, and relay-packet checks.
- The shipped npm package remains on the unavailable scaffold.
- The next implementation step is to connect state sync and terminal output so
  receive/input/resize/tick can return real frames instead of
  `HOVVI_MOSH_UNAVAILABLE`.
