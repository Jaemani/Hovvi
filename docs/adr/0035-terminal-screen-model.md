# ADR 0035: Terminal Screen Model

Date: 2026-06-26

## Status

Accepted

## Context

The first SwiftUI terminal surface rendered scrollback lines directly. That is
not enough for a live terminal because terminal output mutates a screen with
cursor movement, carriage return, erase-line, and clear-screen behavior. Mobile
scrollback must not corrupt the live screen, so the core needs a separate live
screen model before simulator/device rendering work.

## Decision

Add `TerminalScreen` to `HovviMobileCore`.

The initial model supports:

- fixed row/column screen storage;
- printable UTF-8 scalar writes;
- carriage return, line feed, and backspace;
- basic CSI cursor movement;
- erase display with `CSI J`;
- erase line with `CSI K`;
- resize while preserving visible cells;
- basic SGR text attribute preservation was added in ADR 0036;
- alternate-screen preservation was added in ADR 0037.
- extended foreground color preservation was added in ADR 0038.
- background color preservation was added in ADR 0039.
- wide grapheme cursor advancement was added in ADR 0041.
- inverse attribute rendering was added in ADR 0042.
- scroll-region line-feed behavior was added in ADR 0043.
- reverse-index bounded scrolling was added in ADR 0044.
- DEC origin mode was added in ADR 0045.
- saved cursor state was added in ADR 0046.
- insert/delete line was added in ADR 0047.
- character insert/delete was added in ADR 0048.
- tab stops and erase character were added in ADR 0049.
- erase display/line modes were added in ADR 0052.
- cursor line/column movement was added in ADR 0053.
- bracketed paste mode was added in ADR 0054.
- OSC control-sequence skipping was added in ADR 0105.
- DEC character set handling was added in ADR 0106.
- Cursor visibility state was added in ADR 0107.

`AttachShellModel` now maintains `terminalScreen` alongside tmux
`ScrollbackBuffer`. ADR 0055 keeps live terminal output out of the scrollback
buffer while `TerminalSurfaceView` composes scrollback rows with the current live
screen rows for display.

## Consequences

The iOS shell now has a distinct live-screen surface, which is the right boundary
for future ANSI parsing, keyboard, paste, and simulator screenshot validation.
This is not yet a complete terminal emulator. Full ANSI/VT behavior,
ambiguous-width parity, selection, saved character sets, theme-aware default
colors, wide-character edge repair, and performance profiling remain pending.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- ADR 0034: SwiftUI Attach Shell Target.
