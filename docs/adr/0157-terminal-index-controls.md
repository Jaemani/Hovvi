# ADR 0157: Terminal Index Controls

## Status

Accepted

## Context

`TerminalScreen` already handled line feed, reverse index, tab-stop setting,
ESC-prefixed CSI, and selected C1 CSI/OSC/ST controls. VT-compatible streams can
also use ESC and C1 forms of index and next-line controls:

- IND moves the cursor down one row, scrolling at the bottom margin without
  returning to column zero.
- NEL returns to column zero and then moves down one row.
- HTS sets a horizontal tab stop at the current column.
- RI performs reverse index.

If these controls render as printable text, tmux or ncurses output can corrupt
the mobile live screen during relay-backed attach.

## Decision

`TerminalEscapeParser` now recognizes:

- `ESC D` and C1 `U+0084` as IND.
- `ESC E` and C1 `U+0085` as NEL.
- C1 `U+0088` as HTS.
- C1 `U+008D` as RI.

The implementation reuses the existing `TerminalScreen` line-feed,
carriage-return, tab-stop, and reverse-index behavior. It does not add unrelated
terminal modes or broader C1 handling.

## Consequences

- IND/NEL/HTS/RI controls no longer appear as visible text.
- Existing scroll-region and tab-stop behavior is shared by the ESC and C1
  control forms.
- The parser remains intentionally scoped to controls needed by the current
  relay-backed mobile attach path.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
