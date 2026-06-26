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
- clear screen with `CSI 2 J`;
- erase current line with `CSI K`;
- resize while preserving visible cells.

`AttachShellModel` now maintains `terminalScreen` alongside tmux
`ScrollbackBuffer`. `TerminalSurfaceView` renders the live terminal screen when
it has visible text, and falls back to scrollback lines otherwise.

## Consequences

The iOS shell now has a distinct live-screen surface, which is the right boundary
for future ANSI parsing, keyboard, paste, and simulator screenshot validation.
This is not yet a complete terminal emulator. Full ANSI/VT behavior, text
attributes, alternate screen, wide grapheme handling, selection, and performance
profiling remain pending.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- ADR 0034: SwiftUI Attach Shell Target.
