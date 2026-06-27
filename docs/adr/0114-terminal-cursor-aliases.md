# ADR 0114: Terminal Cursor Movement Aliases

Date: 2026-06-28

## Status

Accepted

## Context

Terminal applications can use CSI aliases for cursor movement in addition to
the core `A/B/C/D/E/F/G/H` sequences. Hovvi already supports the common base
cursor controls, but ignored horizontal-position-relative, vertical-position-
relative, and vertical-position-absolute aliases.

## Decision

`TerminalScreen` now recognizes:

- `CSI n a`: move cursor forward `n` columns;
- `CSI n e`: move cursor down `n` rows;
- `CSI n d`: move cursor to absolute row `n` while preserving the column.

Vertical movement respects the same origin-mode and scroll-region row bounds
as the existing cursor movement operations.

## Consequences

- More ncurses/xterm-style redraw sequences can render without losing cursor
  position.
- `CSI d` is row-only and does not reset the column, matching its use as
  vertical position absolute.
- No relay, mosh packet, scrollback, or package boundary behavior changes.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
- ADR 0045: Terminal Origin Mode.
