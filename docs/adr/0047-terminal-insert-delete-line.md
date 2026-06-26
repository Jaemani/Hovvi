# ADR 0047: Terminal Insert/Delete Line

## Status

Accepted

## Context

Full-screen terminal programs use line insertion and deletion to redraw panes,
lists, and editor regions without repainting the entire screen. Hovvi's live
terminal model already supports bounded scroll regions, reverse index, origin
mode, and saved cursor state, but it did not handle `CSI L` or `CSI M`.

## Decision

`TerminalEscapeParser` now recognizes:

- `CSI Ps L` insert line;
- `CSI Ps M` delete line.

`TerminalScreen` applies both operations only when the cursor is inside the
active scroll region. Without an explicit scroll region, the full screen is the
active region. Insert line shifts rows from the cursor down toward the region
bottom and blanks the inserted rows. Delete line shifts rows below the cursor up
and blanks the region bottom. Counts are clamped to the remaining rows in the
active region.

Character-level insert/delete (`CSI @` and `CSI P`) remains separate pending
work. This ADR covers only line operations.

## Consequences

- Common tmux/editor redraw flows can mutate bounded regions without corrupting
  content outside the region.
- The operation stays in the Swift live-screen model and does not affect
  tmux-native scrollback history.
- Character insert/delete, tab stops, saved character sets, and broader VT
  parity remain pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

