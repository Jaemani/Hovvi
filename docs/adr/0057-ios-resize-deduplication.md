# ADR 0057: iOS Resize Deduplication

## Status

Accepted

## Context

The SwiftUI attach shell derives terminal dimensions from geometry changes.
During layout, keyboard, split-view, and rotation transitions, the same terminal
size can be reported more than once. The app controller already records the last
size, but the core attach model should also be safe when resize requests come
from tests, alternate UI surfaces, or future simulator/device harnesses.

Sending duplicate resize packets wastes mosh frames and can make validation
harder because a rendering-only geometry change looks like a terminal protocol
event.

## Decision

`AttachShellModel.resize(to:)` now treats an unchanged terminal size as a no-op
when the current `TerminalScreen` already has that column and row count. It
returns the existing snapshot without calling the mosh core or sending relay
datagrams.

The app-level `lastResize` guard remains as a UI-side optimization, but the core
model owns the protocol invariant.

## Consequences

- Repeated SwiftUI geometry callbacks do not produce duplicate mosh resize
  packets.
- Resize behavior remains deterministic for smoke tests and future simulator
  validation.
- Actual size changes still resize `TerminalScreen`, call the mosh core, and
  flush outbound relay datagrams.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
