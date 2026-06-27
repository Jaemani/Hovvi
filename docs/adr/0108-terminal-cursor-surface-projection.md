# ADR 0108: Terminal Cursor Surface Projection

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0107 added DEC cursor visibility state to `TerminalScreen` and kept cursor
state separate from terminal text. The SwiftUI terminal surface still needed a
way to draw the live insertion cursor without mutating `visibleLines`, tmux
scrollback rows, or SGR text runs.

## Decision

`TerminalSurfaceLine` now carries optional `cursorColumn` metadata.

`TerminalSurfaceProjection` sets that metadata only for the live screen row that
matches `TerminalScreen.cursorRow` and only when `TerminalScreen.isCursorVisible`
is true. Scrollback rows never receive cursor metadata.

When a live screen has no text but has a visible cursor after receiving live
terminal bytes, projection still emits the live blank rows so a cleared terminal
can show the cursor. Before first live output, projection keeps the existing
scrollback-only fallback.

`TerminalSurfaceLineView` renders the cursor as a separate SwiftUI overlay using
terminal cell geometry. Text runs remain the source of rendered glyphs and
attributes.

## Consequences

- Cursor rendering no longer requires sentinel characters inside terminal text.
- tmux scrollback remains immutable display history and cannot accidentally show
  the live cursor.
- Hidden-cursor full-screen redraw phases suppress the cursor in the UI.
- Pixel-perfect cursor styling can evolve independently from terminal parsing.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0107: Terminal Cursor Visibility State.
