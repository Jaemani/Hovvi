# ADR 0036: Terminal SGR Attributes

Date: 2026-06-26

## Status

Accepted

## Context

The initial `TerminalScreen` preserved live text and basic cursor behavior, but
stored each cell as only a character. Real tmux, Claude Code, Codex, and shell
sessions use SGR attributes for status, errors, prompts, and selections. Losing
that metadata would make the mobile terminal harder to scan and would limit the
value of a native renderer.

## Decision

Extend `TerminalScreen` cells with `TerminalTextAttributes` and expose grouped
`TerminalScreenRun` values per line.

The first attribute slice supports:

- bold;
- italic;
- underline;
- inverse flag preservation;
- ANSI foreground colors 30-37 and bright colors 90-97;
- reset/default handling for SGR 0, 22, 23, 24, 27, and 39.
- extended foreground colors were added in ADR 0038.

`TerminalSurfaceView` now renders runs as composed SwiftUI `Text` values and
maps foreground colors to native colors. This keeps the renderer native-first
while preserving terminal styling information for later refinement.

## Consequences

The live terminal surface can now preserve and display basic prompt/status/error
styling. Background colors, alternate screen edge cases, wide grapheme width,
and full VT compatibility remain pending.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- ADR 0035: Terminal Screen Model.
