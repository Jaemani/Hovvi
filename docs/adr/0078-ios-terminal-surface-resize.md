# ADR 0078: iOS Terminal Surface Resize

## Status

Accepted

## Context

The iOS app must send terminal resize events that match the visible terminal
surface. The previous SwiftUI wiring calculated `MoshCoreTerminalSize` from the
whole terminal detail view. That view includes the input field and shortcut
toolbar, so reported rows could exceed the actual terminal output area on
mobile.

This matters for mosh/tmux compatibility because remote programs lay out output
from the reported rows and columns.

## Decision

Add a public `TerminalGeometry` projection in `HovviMobileUI`.

`TerminalSurfaceView` now observes only its own rendered geometry and emits
`onResize(TerminalGeometry.terminalSize(width:height:))`. `TerminalDetail` no
longer derives terminal size from the entire detail stack.

The projection keeps the current conservative minimum of 40 columns and 12 rows
while making the sizing contract smoke-testable.

## Consequences

- Resize packets better match the visible terminal surface.
- Input controls no longer inflate the reported terminal row count.
- The geometry-to-terminal-size mapping is testable without simulator rendering.
- Future simulator/device screenshot checks can build on the same projection.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
