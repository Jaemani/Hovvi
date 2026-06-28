# ADR 0163: Buffer split terminal control sequences

## Status

Accepted.

## Context

Relay datagram and mosh frame boundaries are byte transport boundaries, not
terminal escape-sequence boundaries. `TerminalScreen` already buffered split
UTF-8 bytes and string-control payloads, but an incomplete `ESC`, CSI, C1 CSI,
or G0 character-set designation could be dropped when it ended exactly at an
`apply` boundary. The following frame would then render the remaining
parameters as printable text or fail to apply the intended terminal state.

That is a core iOS attach quality issue because tmux, shells, and full-screen
terminal programs commonly emit cursor movement, SGR, and line-drawing controls
that can be split by the relay receive path.

## Decision

`TerminalScreen` now keeps a pending control prefix for incomplete non-string
controls and prepends it to the next `apply` call before parsing:

- split `ESC` prefixes;
- split CSI parameter streams, including raw C1 CSI bytes decoded from relay
  data frames;
- split G0 character-set designations such as `ESC ( 0`.

The existing OSC/DCS/PM/APC/SOS skip state remains separate because those
payloads are string controls with their own termination rules. RIS reset clears
the pending control prefix together with the rest of the live terminal parser
state.

## Consequences

- Terminal cursor movement, SGR, and DEC line-drawing controls remain stable
  when transport frames split escape sequences.
- The parser still does not implement unrelated terminal features such as mouse
  tracking or device-status replies.
- Incomplete controls remain buffered until completed or reset; they are not
  rendered as printable text.

## Verification

- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## Files

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
