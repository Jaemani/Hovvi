# ADR 0155: Terminal Saved Character Set

## Status

Accepted

## Context

`TerminalScreen` already supports DEC special graphics character set selection,
which tmux and ncurses use for box drawing. It also supports DEC (`ESC 7/8`) and
CSI (`CSI s/u`) saved cursor state, but the saved cursor only restored position
and text attributes.

That left a compatibility gap: terminal programs can save the cursor while the
DEC line-drawing character set is active, switch back to ASCII for surrounding
text, and then restore the saved state before drawing more line characters.
Without saving the character set, restored line-drawing output can render as
plain ASCII.

## Decision

`TerminalSavedCursor` now stores the active terminal character set alongside
cursor position and text attributes. Both DEC and CSI save/restore paths use the
same saved cursor state, so both restore the character set before subsequent
text writes.

The behavior is still scoped to the existing G0 ASCII/DEC special graphics
support. This does not add G1/G2/G3 character sets, locking shifts, or broader
terminal emulation.

## Consequences

- tmux/ncurses line drawing remains stable across saved cursor restore.
- The implementation stays inside `HovviMobileCore`; SwiftUI views and the C ABI
  boundary are unchanged.
- Future full character-set work can extend the saved cursor payload instead of
  changing the public terminal surface.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
