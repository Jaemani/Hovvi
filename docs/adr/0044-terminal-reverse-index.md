# ADR 0044: Terminal Reverse Index

## Status

Accepted

## Context

Full-screen terminal programs commonly use reverse index (`ESC M`) with scroll
margins to move content down inside a bounded region. After ADR 0043 added
forward line-feed scrolling inside `CSI r` margins, the inverse operation was
still missing. That left the live terminal model asymmetric for tmux and
alternate-screen style redraws.

## Decision

`TerminalEscapeParser` now recognizes `ESC M` as a reverse-index token.
`TerminalScreen` handles it with the active scroll region when one is set, or
the full screen otherwise:

- if the cursor is on the top margin, content in the region scrolls down and the
  top margin becomes blank;
- otherwise the cursor moves up one row without modifying existing cells.

The implementation remains in the Swift terminal model. It does not change the
relay protocol, C ABI, or upstream mosh boundary.

## Consequences

- The live terminal screen now supports both forward and reverse bounded
  scrolling.
- This improves tmux/full-screen renderer parity without mixing live screen
  state with tmux-native scrollback history.
- Origin mode, insert/delete line, and exact xterm margin edge cases remain
  pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

