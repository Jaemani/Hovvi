# ADR 0107: Terminal Cursor Visibility State

Date: 2026-06-27

## Status

Accepted

## Context

Terminal applications commonly hide and show the cursor with DEC private mode
25: `CSI ? 25 l` and `CSI ? 25 h`. Hovvi already tracks cursor row and column,
but the screen model did not expose whether the remote program wanted the cursor
visible. Without that state, the future SwiftUI cursor renderer cannot
distinguish normal insertion points from full-screen redraw phases that hide the
cursor intentionally.

## Decision

`TerminalScreen` now exposes `isCursorVisible`, defaulting to `true`.

The parser recognizes:

- `CSI ? 25 l`: hide cursor;
- `CSI ? 25 h`: show cursor.

Cursor visibility is kept separate from `visibleLines`. This preserves the
existing invariant that `visibleLines` represents terminal text cells only.
SwiftUI cursor drawing should consume `cursorRow`, `cursorColumn`, and
`isCursorVisible` through a separate projection layer rather than mutating text
runs.

## Consequences

- Cursor visibility state is now deterministic and smoke-tested.
- Existing text, scrollback, SGR, and line-projection invariants do not change.
- Actual cursor drawing is handled by ADR 0108 as UI projection metadata, without
  corrupting terminal text or scrollback.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
