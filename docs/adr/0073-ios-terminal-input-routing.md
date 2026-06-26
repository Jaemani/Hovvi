# ADR 0073: iOS Terminal Input Routing

## Status

Accepted

## Context

The iOS attach UI sends typed text into the mosh input path. Single-line input
should be sent as ordinary terminal text, while multi-line input should be
treated as paste so bracketed-paste mode can wrap it when the remote terminal
enables `CSI ? 2004 h`.

This selection logic previously lived inside the SwiftUI view, making it harder
to validate without rendering UI.

## Decision

`TerminalInputCommand.userText(_:bracketedPasteEnabled:)` is the shared routing
helper for user-entered terminal text:

- single-line text maps to `.text`
- multi-line text maps to `.paste`
- bracketed-paste mode is preserved only for paste input

`TerminalDetail` now uses this helper instead of duplicating the routing logic.

## Consequences

- UI input routing is covered by `HovviMobileCoreSmoke`.
- The behavior stays independent of SwiftUI rendering.
- This does not change relay protocol, mosh frame semantics, or terminal key
  byte encodings.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
