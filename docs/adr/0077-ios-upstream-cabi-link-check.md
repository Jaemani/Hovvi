# ADR 0077: iOS Upstream C ABI Link Check

## Status

Accepted

## Context

The iOS alpha path uses `CAbiMoshCoreEngine` so Swift depends on the stable C ABI
instead of upstream mosh C++ layout. The normal SwiftPM app target still links
the MIT-compatible unavailable scaffold, while the repository has a
GPL-linked upstream static library for validation.

Before this decision, Swift smoke coverage proved the unavailable scaffold
import path, and native C++ smokes proved the upstream ABI, but no automated
check proved that Swift can link and call the upstream-backed C ABI.

## Decision

Add `npm run ios:upstream-cabi-link-check`.

The script:

- builds `native/mosh-core/build/upstream/libhovvi_mosh_core_upstream.a`
- creates a temporary Swift module map for `hovvi_mosh_core.h`
- compiles a temporary Swift binary with `swiftc`
- links the binary to the repository-only upstream ABI static library
- calls `hovvi_mosh_core_create`, validates invalid-key handling, creates a
  valid upstream core, shuts it down, and frees ABI-owned frame/core state

The shipped SwiftPM app target remains unchanged and continues to use the
unavailable scaffold unless a later explicit GPL distribution decision closes
that gate.

## Consequences

- Swift/upstream ABI linkage is validated without exposing C++ types to Swift.
- GPL-linked upstream artifacts remain repository-only validation artifacts.
- CI catches Swift/C ABI drift before simulator or device attach work depends on
  the upstream library.
- This does not ship or package a GPL-linked mobile app.

## Validation

- `npm run ios:upstream-cabi-link-check`
