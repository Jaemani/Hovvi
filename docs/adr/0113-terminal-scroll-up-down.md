# ADR 0113: Terminal Scroll Up and Down

Date: 2026-06-28

## Status

Accepted

## Context

Full-screen terminal programs can scroll the display explicitly with `CSI S`
and `CSI T`, instead of relying only on line feed, reverse index, or line
insert/delete. Hovvi already respects scroll regions for line-feed and line
editing operations, but ignored these scroll commands.

## Decision

`TerminalScreen` now recognizes:

- `CSI n S`: scroll up `n` rows;
- `CSI n T`: scroll down `n` rows.

The operations mutate the current scroll region when one is active, otherwise
the full live screen. They do not change the cursor position.

## Consequences

- Terminal applications can redraw viewport content using standard scroll
  commands without corrupting fixed top/bottom rows.
- Existing line insert/delete behavior remains cursor-relative; `S` and `T`
  are region-relative.
- tmux-native scrollback remains separate from live-screen mutations.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
- ADR 0043: Terminal Scroll Regions.
