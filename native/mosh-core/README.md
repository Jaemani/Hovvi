# Hovvi Mosh Core Boundary

This directory defines Hovvi's C ABI boundary for an upstream-mosh-backed native core.

The current shipped ABI implementation is still an unavailable scaffold. Vendored upstream mosh source lives under `vendor/mosh` for adapter development and compliance review, but it is not linked into the MIT npm package artifact yet.

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

## Upstream Compile Check

```bash
make -C native/mosh-core upstream-check
```

This compiles a narrow vendored upstream mosh crypto smoke on Apple platforms through `config/apple-common-crypto-config.h`. It verifies the AES-OCB session encrypt/decrypt path without changing the scaffold ABI behavior used by `make check`.
