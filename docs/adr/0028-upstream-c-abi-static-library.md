# ADR 0028: Upstream C ABI Static Library

## Status

Accepted

## Context

The upstream-backed C ABI implementation already had smoke coverage, but the
test linked object files directly. The iOS/macOS native engine path needs a
repository-only static library artifact that exposes the stable C ABI without
requiring Swift or app code to know upstream C++ class layout.

The npm package must still ship only the unavailable MIT scaffold until the
native/mobile GPL distribution decision is made.

## Decision

Add `make -C native/mosh-core upstream-lib`, exposed as
`npm run native:upstream-lib`.

The target builds:

- `native/mosh-core/build/upstream/libhovvi_mosh_core_upstream.a`

The library contains the repository-only upstream C ABI implementation and the
required vendored upstream mosh object files. `upstream_abi_smoke` now links
against this library instead of linking the objects directly.

## Rationale

This creates the artifact shape that future Swift/iOS and local macOS native
engine work will consume, while keeping the legal/package boundary explicit.

## Consequences

- CI verifies the upstream C ABI static library build.
- The npm package contents remain unchanged with respect to GPL upstream source:
  only the unavailable scaffold is included in npm artifacts.
- App distribution with this library remains behind the explicit GPL mobile
  distribution gate.
