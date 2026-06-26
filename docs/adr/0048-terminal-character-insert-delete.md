# ADR 0048: Terminal Character Insert/Delete

## Status

Accepted

## Context

After ADR 0047 added line insert/delete, the live terminal model still lacked
row-local character insertion and deletion. Shell prompts, completion menus, and
editor status lines commonly use `CSI @` and `CSI P` to edit text inside a row
without repainting the entire line.

## Decision

`TerminalEscapeParser` now recognizes:

- `CSI Ps @` insert character;
- `CSI Ps P` delete character.

`TerminalScreen` applies both operations on the current row from the cursor
column to the right edge. Insert character shifts cells right and fills the
inserted span with blanks using the current SGR attributes. Delete character
shifts cells left and blanks the tail using the current SGR attributes. Counts
are clamped to the remaining columns in the row.

This ADR intentionally does not add tab stops, erase character (`CSI X`), or
full wide-character edge-case repair. Those remain separate terminal model
work.

## Consequences

- Prompt and editor redraws can mutate row-local text without corrupting
  scrollback or live-screen row structure.
- Inserted blanks preserve current attributes, matching the model used by
  visible SGR runs.
- Wide-grapheme continuation repair, tab stops, erase character, saved
  character sets, and broader VT parity remain pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

