# ADR 0011: Native Upstream Packet Smoke

## Status

Accepted

## Context

The network fragment smoke compiles protobuf generation, zlib compression, and upstream fragment assembly. The next layer in upstream mosh is `Network::Packet` and `Network::Connection`.

`Network::Transport` directly owns a `Connection`, and `Connection` opens UDP sockets in its constructors. That means Hovvi cannot inject an in-process relay queue into the current upstream class boundary without either wrapping below `Connection::send`/`recv` or introducing a small adapter seam.

## Decision

Extend `native:upstream-check` with a packet smoke that compiles upstream `network.cc` and `timestamp.cc`, then verifies:

- `Network::Packet` to/from `Crypto::Message` serialization
- port range parsing for a valid range
- timestamp wraparound math

Do not instantiate `Connection` or `Transport` in this smoke. Full in-process relay testing should come after an explicit adapter boundary is designed.

## Rationale

This moves the build from fragment-only code into upstream packet code while avoiding accidental socket/network dependence in CI. It also documents the exact point where upstream's API stops being directly testable without a Hovvi relay adapter seam.

## Consequences

- The upstream deep check now compiles `network.cc`, but does not exercise live UDP sockets.
- The next adapter slice should introduce a Hovvi-owned packet IO interface or wrapper around `Connection::send`/`recv`.
- CI remains deterministic and does not require port allocation beyond build tooling.
