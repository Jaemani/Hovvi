# ADR 0111: Terminal Autowrap Mode

Date: 2026-06-28

## Status

Accepted

## Context

DEC autowrap mode controls whether printable output at the right edge wraps to
the next row. The mode is enabled by default and can be toggled with
`CSI ? 7 h/l`. Hovvi previously always wrapped at the right edge, which is
reasonable for normal shell output but wrong for terminal programs that
temporarily disable autowrap while drawing fixed-width regions.

## Decision

`TerminalScreen` now tracks `isAutoWrapModeEnabled`, defaulting to `true`.

The parser recognizes:

- `CSI ? 7 l`: disable autowrap;
- `CSI ? 7 h`: enable autowrap.

When autowrap is disabled, printable characters written at or past the right
edge stay on the current row and the cursor clamps to the final column. When the
mode is re-enabled, the existing wrap behavior resumes.

## Consequences

- Full-screen terminal programs can draw right-edge cells without causing
  unexpected line feeds.
- Default shell output keeps prior wrapping behavior.
- Wide-character edge behavior remains conservative; future terminal fidelity
  work can refine exact VT behavior for wide glyphs at the last column.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
