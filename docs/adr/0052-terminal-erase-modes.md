# ADR 0052: Terminal Erase Modes

## Status

Accepted

## Context

The first `TerminalScreen` erase implementation treated `CSI K` as whole-line
erase with cursor reset and only accepted `CSI 2 J` for display clear. Real
terminal applications use VT erase modes to repaint prompts, completion menus,
and full-screen editor regions without moving the cursor.

## Decision

`TerminalEscapeParser` now recognizes mode `0`, `1`, and `2` for:

- `CSI Ps J` erase display;
- `CSI Ps K` erase line.

Mode `0` erases from the cursor through the end of the line/display. Mode `1`
erases from the start through the cursor. Mode `2` erases the whole
line/display. Erase operations preserve cursor position and use the current SGR
attributes for blank cells.

## Consequences

- Shell and editor repaint behavior is closer to VT-compatible terminals.
- Tests that wanted clear-and-write-at-home now explicitly send cursor movement
  rather than relying on erase side effects.
- Full scrollback erasure modes beyond the live screen remain out of scope
  because tmux-native scrollback is intentionally modeled separately.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
