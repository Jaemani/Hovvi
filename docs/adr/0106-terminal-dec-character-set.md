# ADR 0106: Terminal DEC Character Set Handling

Date: 2026-06-27

## Status

Accepted

## Context

tmux, shells, and ncurses-style programs can emit VT character set designation
sequences such as `ESC ( B` for ASCII and `ESC ( 0` for DEC special graphics.
If the terminal model treats an unknown `ESC (` sequence as printable text, the
mobile surface can show stray `(B` bytes. If DEC special graphics are not
mapped, box drawing output appears as ordinary letters such as `lqk`.

## Decision

`TerminalScreen` now consumes G0 character set designations for:

- `ESC ( B`: switch printable output back to ASCII;
- `ESC ( 0`: switch printable output to DEC special graphics.

While DEC special graphics is active, common line drawing and symbol bytes are
mapped to Unicode box drawing/symbol characters before entering the screen grid.
Unsupported G0 designators are consumed and ignored instead of being rendered as
text.

This is a focused terminal-fidelity slice. It does not implement G1/G2/G3
selection, locking shifts, single shifts, or full VT character set parity.

## Consequences

- Common tmux/ncurses line drawing renders closer to a native terminal on
  mobile.
- ASCII designation resets no longer leak control-sequence bytes into live
  terminal output.
- The behavior remains inside the Swift terminal model and does not change
  mosh, relay, or package boundaries.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
