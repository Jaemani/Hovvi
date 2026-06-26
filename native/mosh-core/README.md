# Hovvi Mosh Core Boundary

This directory defines Hovvi's C ABI boundary for a future upstream-mosh-backed native core.

It intentionally does not vendor mosh source yet. The next step is to build an adapter that wraps upstream mosh internals behind `include/hovvi_mosh_core.h` while preserving the upstream license notices and source availability requirements.

The ABI is packet-oriented:

- inbound relay datagram packets enter through `hovvi_mosh_core_receive_packet`
- user input and terminal resize events produce outbound mosh packets
- terminal renderer output is returned as frame data for the native mobile UI

The C ABI exists so Swift, Kotlin, and future test harnesses do not depend directly on upstream C++ class layout.

## Local Check

```bash
make -C native/mosh-core check
```

The current implementation is an unavailable scaffold. It validates the ABI, status values, printable mosh key shape, frame cleanup, and build wiring before upstream mosh source is linked.
