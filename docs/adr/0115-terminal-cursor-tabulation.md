# ADR 0115: Terminal Cursor Tabulation

Date: 2026-06-28

## Status

Accepted

## Context

Hovvi already supports horizontal tab (`HT`), default tab stops, custom `ESC H`
tab stops, and `CSI g` tab clearing. Terminal programs can also move the cursor
by tab stops with CSI cursor tabulation sequences.

## Decision

`TerminalScreen` now recognizes:

- `CSI n I`: move forward by `n` tab stops;
- `CSI n Z`: move backward by `n` tab stops.

Forward tabulation reuses the existing horizontal-tab behavior and clamps to
the right edge when no later tab stop exists. Backward tabulation walks previous
tab stops and clamps to column zero when no earlier tab stop exists.

## Consequences

- Full-screen terminal redraws that use cursor tabulation can position text
  against Hovvi's existing tab-stop model.
- Tab-stop mutation remains centralized through `ESC H` and `CSI g`.
- No relay, mosh packet, scrollback, or package boundary behavior changes.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0049: Terminal Tab Stops and Erase Character.
