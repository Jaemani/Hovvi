# ADR 0053: Terminal Cursor Line and Column Movement

## Status

Accepted

## Context

The iOS live terminal model supported basic cursor movement with `CSI A/B/C/D`
and row/column addressing with `CSI H/f`. Many terminal applications also use
line-based cursor movement and absolute horizontal positioning to repaint
prompts, completion menus, and status lines.

## Decision

`TerminalEscapeParser` now recognizes:

- `CSI Ps E` cursor next line;
- `CSI Ps F` cursor previous line;
- `CSI Ps G` and `CSI Ps \`` cursor horizontal absolute.

`TerminalScreen` applies `E` and `F` within the active cursor row bounds and
resets the cursor column to zero. In DEC origin mode, those row bounds are the
active scroll region. `G`/`` ` `` clamps the target column to the current screen
width and does not change the row.

## Consequences

- Prompt and full-screen repaint behavior is closer to common VT-compatible
  terminals.
- Origin-mode cursor movement remains bounded inside active margins.
- More complete terminal parity still requires saved character sets, selection,
  ambiguous-width parity, wide-character edge repair, and performance work.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
