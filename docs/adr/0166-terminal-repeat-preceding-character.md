# ADR 0166: Terminal Repeat Preceding Character

Date: 2026-06-28

## Status

Accepted

## Context

tmux, ncurses, and full-screen terminal programs can use `CSI Ps b` REP
(Repeat Preceding Character) to draw repeated glyphs without sending each cell
as a separate printable character. Without REP support, the Swift mobile
terminal silently drops those repetitions, which can leave line drawing,
progress blocks, padding, and table regions visually incomplete on iOS attach.

## Decision

`TerminalScreen` now tracks the last rendered graphic character and handles
`CSI b` by replaying that character through the existing `put` path. This keeps
autowrap, wide-cell handling, attributes, and scroll-region behavior aligned
with normal printable input.

If no graphic character has been rendered yet, REP is ignored. Entering the
alternate screen resets the repeated-character source for that screen and
restores the primary source when the primary screen is restored.

## Consequences

- tmux/ncurses repeated line drawing and padding render more like a native
  terminal on mobile.
- The behavior remains inside the Swift terminal model. It does not change relay
  protocol, native mosh linkage, package contents, authentication, or mobile
  distribution policy.
- REP uses the current attributes for repeated cells because it reuses the
  existing printable path.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
