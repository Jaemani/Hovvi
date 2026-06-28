# ADR 0167: Terminal DEC Private Cursor Save

## Status

Accepted

## Context

Hovvi's iOS alpha attach shell must preserve terminal state produced by tmux,
shell integrations, and full-screen terminal programs. `TerminalScreen` already
handled DEC save/restore (`ESC 7`/`ESC 8`) and CSI save/restore (`CSI s`/`CSI u`)
while preserving cursor position, SGR attributes, and the active ASCII/DEC
special graphics character set.

Some xterm-compatible streams also use DEC private mode 1048:

- `CSI ? 1048 h`: save cursor;
- `CSI ? 1048 l`: restore cursor.

Ignoring this mode can leave later output at the wrong row or column after a
program temporarily moves the cursor for status, prompt, or alternate-screen
setup work.

## Decision

Teach `TerminalScreen` to handle DEC private mode 1048 through the existing
saved-cursor path:

- enabling mode 1048 calls the same save routine used by DEC and CSI cursor
  save controls;
- disabling mode 1048 calls the same restore routine;
- the saved state continues to include cursor position, SGR attributes, and the
  active ASCII/DEC special graphics character set.

Mode 1047 and 1049 alternate-screen handling remains on the existing
alternate-screen snapshot path.

## Consequences

- xterm-style cursor save/restore mode no longer leaves visible terminal output
  at the wrong cursor location.
- Existing DEC and CSI saved-cursor behavior remains unchanged.
- This does not implement the broader DEC private mode family, mouse tracking,
  focus events, or exact xterm alternate-screen edge cases.

## Verification

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

