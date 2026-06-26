# ADR 0010: Native Upstream Network Smoke

## Status

Accepted

## Context

The crypto smoke proves that Hovvi can compile and execute upstream mosh AES-OCB session code in isolation. The next protocol boundary is mosh's transport fragmentation path, which depends on generated protobuf C++ code and zlib compression.

Upstream Autotools normally generates `*.pb.cc` and `*.pb.h` next to the `.proto` files. Hovvi must keep the vendored upstream tree immutable so the manifest hashes continue to describe only audited source files.

## Decision

Extend `native:upstream-check` with a network smoke that:

- generates `transportinstruction.pb.cc` and `.pb.h` under `build/upstream/generated`
- compiles upstream `compressor.cc` and `transportfragment.cc`
- links protobuf-lite through `pkg-config` so abseil transitive libraries follow the installed protobuf version
- runs a fragment serialize/parse/assemble round trip through `Network::Fragmenter` and `Network::FragmentAssembly`

CI installs `pkgconf` and `protobuf` before running the upstream check. The generated protobuf outputs remain build artifacts and are not committed or published in the npm package.

## Rationale

This verifies the first mosh network transport behavior that Hovvi's relay adapter will need, without introducing direct UDP sockets or the full `mosh-client` terminal loop. Using `pkg-config` avoids hardcoding Homebrew's protobuf/abseil link graph, which changes across protobuf releases.

## Consequences

- `native:upstream-check` now requires `protoc`, protobuf-lite, zlib, and pkg-config-compatible protobuf metadata.
- The published npm artifact still excludes vendored GPL source, generated protobuf code, and upstream-only test harness files.
- The next deep check can move from fragment assembly to `Network::Transport` packet send/recv behavior over in-process relay queues.
