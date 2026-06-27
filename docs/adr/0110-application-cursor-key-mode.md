# ADR 0110: Application Cursor Key Mode

Date: 2026-06-28

## Status

Accepted

## Context

Full-screen terminal programs can enable DEC application cursor-key mode with
`CSI ? 1 h` and disable it with `CSI ? 1 l`. In that mode, arrow keys are sent
as SS3 sequences (`ESC O A/B/C/D`) instead of normal cursor sequences
(`CSI A/B/C/D`). Hovvi already sends arrow keys through `TerminalInputCommand`,
but they were always encoded in normal cursor mode.

## Decision

`TerminalScreen` now tracks `isApplicationCursorKeysModeEnabled`.

`TerminalInputCommand` keeps the existing `bytes` property for normal mode and
adds `bytes(applicationCursorKeysMode:)` for mode-aware arrow encoding.
`TerminalDetail` reads the current `TerminalScreen` mode when sending toolbar
arrow buttons.

## Consequences

- tmux, pagers, editors, and curses-style programs that request application
  cursor keys receive the expected arrow sequences from the mobile toolbar.
- Existing call sites that use `bytes` keep normal cursor-key behavior.
- Application keypad mode remains separate and can be added later without
  changing this arrow-key contract.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCore/TerminalInputCommand.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0050: Terminal Input Command Encoding.
- ADR 0109: Terminal Navigation Input Keys.
