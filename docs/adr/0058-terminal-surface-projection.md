# ADR 0058: Terminal Surface Projection

## Status

Accepted

## Context

The iOS alpha milestone still needs simulator/device rendering validation, but
the terminal surface also needs a deterministic boundary that can be tested
without launching a simulator. Previously, `TerminalSurfaceView` privately
combined tmux scrollback rows with live terminal screen rows. CI could compile
the view, but it could not assert which rows would be rendered, whether IDs
would collide, or whether the view preserved the scrollback/live distinction.

## Decision

Add `TerminalSurfaceProjection` to `HovviMobileUI`.

The projection maps an `AttachShellSnapshot` into public
`TerminalSurfaceLine` values with:

- stable `scrollback-` IDs for tmux-native history rows;
- stable `live-` IDs for live `TerminalScreen` rows;
- explicit row source metadata;
- attributed `TerminalScreenRun` payloads for the renderer.

`TerminalSurfaceView` now consumes the projection instead of owning row
composition directly.

## Consequences

- CI can validate render inputs before simulator/device screenshot coverage is
  added.
- Future selection, search, anchoring, and screenshot tests can reason about row
  provenance without parsing SwiftUI view internals.
- This does not replace simulator/device validation; it makes that later gate
  easier to reproduce.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
