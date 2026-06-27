# ADR 0079: iOS Terminal No-Wrap Surface

## Status

Accepted

## Context

Terminal output is row-oriented. If SwiftUI wraps a long terminal row into
multiple visual lines, the mobile view no longer matches the remote terminal
grid and scrollback/live screen composition becomes misleading.

The previous terminal surface used a vertical scroll view only. Long rows could
wrap inside the available width instead of remaining one terminal row.

## Decision

`TerminalSurfaceView` now uses both vertical and horizontal scrolling.

Each `TerminalSurfaceLineView` is fixed horizontally with a single-line limit,
and each row has a minimum width derived from the active terminal column count
through `TerminalGeometry.surfaceWidth(columns:)`.

The default minimum remains 40 columns so empty or not-yet-sized terminal
screens still have a stable width.

## Consequences

- Long terminal rows do not visually wrap into extra rows.
- Horizontal scrolling handles output wider than the mobile viewport.
- The live terminal screen remains closer to the mosh/tmux grid model.
- Future simulator/device render checks can assert row geometry on top of this
  deterministic width projection.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
