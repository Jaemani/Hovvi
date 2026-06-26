# ADR 0018: C ABI Mosh Driver Adapter

## Status

Accepted

## Context

ADR 0017 added the Hovvi-owned `MoshRelaySession` seam. It defines how a mosh
core driver is pumped by relay datagrams, but the seam still needed an adapter
from the stable C ABI in `hovvi_mosh_core.h`.

The adapter must stay Hovvi-owned and usable by the MIT package. It must not
link upstream mosh directly; upstream-backed behavior remains behind whichever C
ABI implementation is linked by a repository or mobile build.

## Decision

Add `native/mosh-core/adapter/hovvi_c_abi_mosh_driver.h`.

The adapter:

- wraps `hovvi_mosh_core_*` functions behind `MoshCoreDriver`
- supports function-table injection for tests and platform-specific linking
- maps `hovvi_mosh_status_t` to `MoshCoreStatus`
- copies ABI frame bytes into owned C++ vectors before freeing the ABI frame
- owns/destroys the core when constructed from printable key and terminal size
- can also wrap an existing core pointer without taking ownership

`MoshRelaySession::pump_inbound` now drains outbound packets produced by inbound
core processing as well as input, resize, tick, and shutdown. This matters
because inbound packets can produce acknowledgements or other outbound datagrams
once the full transport path is linked.

## Rationale

This is the missing bridge between the stable C ABI and the relay session pump.
It lets the next macOS harness drive a real C ABI implementation without
exposing upstream C++ types to the relay/session layer.

## Consequences

- `native:adapter-check` now verifies the C ABI driver adapter with an injected
  fake C ABI function table.
- The npm package includes the Hovvi-owned adapter and smoke test.
- Full mosh-server correctness remains a later macOS harness milestone.
