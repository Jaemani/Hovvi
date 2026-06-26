# ADR 0017: Native Relay Session Seam

## Status

Accepted

## Context

The upstream ABI slices can now decrypt inbound packets, render terminal output,
emit outbound input/resize packets, schedule ticks, and report clean shutdown.
The next roadmap step is a relay-backed harness that can feed those ABI frames
through Hovvi relay datagrams and later through a real `mosh-server`.

Before starting a process-level macOS harness, Hovvi needs a small native seam
that defines how a core driver is pumped by a relay datagram endpoint.

## Decision

Add `native/mosh-core/adapter/hovvi_mosh_relay_session.h`.

The seam is Hovvi-owned and does not link upstream mosh. It defines:

- `MoshCoreDriver`: a minimal core interface matching the C ABI shape
- `MoshCoreFrame`: terminal output, outbound packet list, next tick, and clean
  shutdown fields
- `MoshRelaySession`: pumps inbound relay datagrams into the core, drains
  outbound core packets to the relay endpoint, and maps core/relay failures to
  explicit session statuses

`native:adapter-check` now includes `relay_session_smoke.cc`, which verifies:

- empty inbound pump behavior
- inbound packet delivery to the core
- outbound packet draining for input, resize, and tick
- clean shutdown frame propagation
- relay oversize failure propagation
- core error propagation

## Rationale

This is the reusable seam between the native core and the relay transport. It
lets mobile and macOS harness work share the same packet-pump contract without
depending on upstream C++ class layout.

## Consequences

- The npm package includes this Hovvi-owned seam and its adapter smoke test.
- Full mosh-server correctness is still not proven by this seam. The next step
  remains a macOS harness that connects this pump to the upstream-backed ABI and
  a real `mosh-server`/relay datagram path.
