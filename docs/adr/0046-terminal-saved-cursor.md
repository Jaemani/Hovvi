# ADR 0046: Terminal Saved Cursor

## Status

Accepted

## Context

Full-screen terminal programs often save the cursor, draw transient content, and
then restore the cursor before continuing output. Hovvi's live terminal model
already supports cursor addressing, scroll regions, reverse index, and origin
mode, but it did not preserve cursor state across `ESC 7`/`ESC 8` or
`CSI s`/`CSI u`.

## Decision

`TerminalEscapeParser` now recognizes:

- DEC save/restore cursor: `ESC 7` and `ESC 8`;
- CSI save/restore cursor: `CSI s` and `CSI u`.

`TerminalScreen` stores the cursor row, cursor column, and current SGR
attributes. Restore clamps the saved position to the current screen bounds, and
resize also bounds any saved cursor. Alternate-screen entry clears the alternate
screen saved cursor while preserving the primary screen snapshot, including its
saved cursor.

The saved state intentionally excludes charset, tab stops, and unimplemented
private terminal modes. Adding those later should extend the saved cursor model
only after the terminal model owns those states directly.

## Consequences

- Common terminal redraw flows can return to prior cursor position and
  attributes without corrupting live screen state.
- The implementation stays inside the Swift live terminal model and does not
  affect relay, mosh, or tmux-native scrollback contracts.
- Tab stops, insert/delete line, saved character sets, and broader VT state
  parity remain pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

