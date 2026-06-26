# ADR 0059: Terminal Surface Viewport

## Status

Accepted

## Context

`TerminalSurfaceProjection` made terminal render input testable, but the SwiftUI
surface still consumed the full projected row list. The default attach flow asks
for bounded tmux scrollback, but future settings, larger scrollback fetches, and
simulator/device screenshot tests need a deterministic viewport boundary. An
unbounded render list can make mobile scrolling and screenshot validation noisy
without changing terminal protocol behavior.

## Decision

Add `TerminalSurfaceViewport`.

`TerminalSurfaceProjection.viewport` caps projected rows to a bounded suffix,
records the bottom anchor id, and reports whether older rows were truncated
above the viewport. `TerminalSurfaceView` renders this viewport and auto-scrolls
to its anchor instead of recomputing against the full row list.

The default viewport limit is `5000` rows. The full `ScrollbackBuffer` and live
`TerminalScreen` remain unchanged; the cap only constrains the immediate SwiftUI
render input.

## Consequences

- Large scrollback snapshots do not force the SwiftUI terminal surface to render
  an unbounded row list.
- Auto-scroll targets a deterministic bottom anchor.
- CI can validate viewport truncation and anchor behavior before simulator or
  device screenshot tests.
- Future paging/search can use `isTruncatedAbove` to expose older history
  without mixing it into live terminal state.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
