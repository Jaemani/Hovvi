# ADR 0029: Swift C ABI Mosh Core Engine

## Status

Accepted

## Context

The Swift mobile core had a `MoshCoreEngine` protocol and an unavailable fake
implementation. The native side had a stable C ABI scaffold and a
repository-only upstream static library target, but Swift did not yet call the
C ABI directly.

Before linking GPL upstream mosh into an app build, Swift needs a stable wrapper
that proves:

- C ABI import works through SwiftPM
- status values map to Swift errors
- ABI-owned frames are copied and freed correctly
- unavailable scaffold behavior remains explicit

## Decision

Add a SwiftPM C target, `HovviMoshCoreC`, that imports the existing
`hovvi_mosh_core.h` boundary and compiles the MIT unavailable scaffold.

Add `CAbiMoshCoreEngine`, a Swift `MoshCoreEngine` implementation that calls:

- `hovvi_mosh_core_create`
- `hovvi_mosh_core_receive_packet`
- `hovvi_mosh_core_send_user_input`
- `hovvi_mosh_core_resize`
- `hovvi_mosh_core_tick`
- `hovvi_mosh_core_shutdown`
- `hovvi_mosh_frame_free`
- `hovvi_mosh_core_destroy`

The Swift smoke validates unavailable create, receive-before-create, and invalid
terminal size error mapping.

## Rationale

This locks the Swift/native ABI contract before changing the linked native
implementation. The same Swift wrapper can later link the repository-only
upstream static library for validation builds, while npm and app distribution
boundaries remain explicit.

## Consequences

- `swift run HovviMobileCoreSmoke` now exercises the real C ABI scaffold from
  Swift.
- The current Swift package still links only the unavailable scaffold.
- Linking the upstream GPL-backed static library into a mobile app remains
  behind the explicit GPL mobile distribution decision gate.
