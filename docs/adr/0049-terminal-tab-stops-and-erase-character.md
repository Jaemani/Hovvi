# ADR 0049: Terminal Tab Stops and Erase Character

## Status

Accepted

## Context

The iOS alpha live terminal model already supports cursor movement, scroll
regions, saved cursor state, line insert/delete, and character insert/delete.
Interactive shells and full-screen tools also rely on horizontal tabs and
erase-character operations for prompt layout, completion menus, tables, and
status-line repainting.

Without tab stops, `HT` output collapses columns incorrectly. Without
`CSI Ps X`, applications must repaint a row to blank a fixed-width span, which
does not match common VT behavior.

## Decision

`TerminalEscapeParser` now recognizes:

- `HT` (`0x09`) horizontal tab;
- `ESC H` horizontal tab set at the current cursor column;
- `CSI g` / `CSI 0 g` clear the tab stop at the current cursor column;
- `CSI 3 g` clears all tab stops;
- `CSI Ps X` erase character.

`TerminalScreen` initializes tab stops every eight columns, preserves default
tab stops across resize, preserves custom tab stops when resizing within bounds,
and stores tab stop state in the alternate-screen snapshot. Entering the
alternate screen starts with default tab stops for the current width; exiting
restores the primary screen tab stop state.

Horizontal tab moves to the next configured tab stop to the right. If none is
available, it clamps to the last column. Erase character replaces the requested
span from the cursor to the right edge with blank cells using the current SGR
attributes and does not shift remaining text.

## Consequences

- Prompt and table layout using tabs is closer to upstream terminal behavior.
- Applications can blank row spans without changing cursor position or shifting
  text.
- Tab state is explicit live-screen state rather than a parser-only shortcut.
- Remaining terminal parity work includes ambiguous-width parity, selection,
  saved character sets, theme-aware default colors, wide-character edge repair,
  and performance profiling.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
