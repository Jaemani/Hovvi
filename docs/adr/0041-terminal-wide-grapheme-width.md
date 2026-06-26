# ADR 0041: Terminal Wide Grapheme Width

Date: 2026-06-26

## Status

Accepted

## Context

The terminal renderer initially parsed printable output as Unicode scalars.
That was enough for ASCII control-flow tests, but it could split user-visible
graphemes and advance the cursor incorrectly for CJK text, emoji, and combining
marks. Mobile terminal quality depends on preserving the visible character while
keeping terminal cell positions stable.

## Decision

Change `TerminalEscapeParser` to emit printable `Character` values while still
handling terminal control characters and CSI parsing at scalar boundaries.
`TerminalScreen` now assigns an approximate terminal cell width per grapheme:

- combining-mark-only graphemes have width 0 and attach to the previous cell;
- common East Asian wide ranges and emoji ranges have width 2;
- other printable graphemes have width 1.

Wide graphemes occupy the leading cell and mark the following cell as a
continuation. Visible line/run generation skips continuation cells, so text is
rendered once while cursor advancement still respects terminal cell width.

## Consequences

CJK, emoji, and combining-mark output behaves better in the native renderer
without adding a full terminal emulator dependency. The width table is still a
conservative approximation. Ambiguous-width characters, ZWJ emoji clusters,
locale-specific width, and full `wcwidth` parity remain pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- ADR 0035: Terminal Screen Model.
