# ADR 0105: Terminal OSC Sequence Skipping

Date: 2026-06-27

## Status

Accepted

## Context

Shells, tmux, prompts, and terminal integrations commonly emit OSC sequences
such as `ESC ] 0 ; title BEL` or `ESC ] ... ESC \` to set window titles,
badges, hyperlinks, or integration metadata. Hovvi's first iOS terminal screen
does not yet expose a title or OSC metadata model. Rendering those bytes as
printable text corrupts the live terminal surface and makes mobile attach look
broken even when the mosh stream is healthy.

## Decision

`TerminalScreen` now recognizes OSC introducer `ESC ]` and consumes bytes until
the standard BEL terminator or ST terminator (`ESC \`). The skip state is held
on the screen model, so OSC payloads that are split across separate mosh receive
frames continue to be ignored until the terminator arrives. The sequence does
not mutate the screen, cursor, SGR attributes, scrollback, or attach state.

This is intentionally a skip policy, not a full OSC implementation. Hovvi can
add explicit models for titles, hyperlinks, or terminal-integration metadata
later without letting unsupported OSC payloads leak into the live terminal
text.

## Consequences

- Common shell/tmux title updates no longer render as garbage in the mobile
  terminal.
- OSC payloads remain local terminal control metadata and are not interpreted by
  the relay.
- Split OSC sequences across separate `apply` calls no longer leak title or
  integration metadata into the live terminal while waiting for the terminator.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
