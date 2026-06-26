# ADR 0038: Terminal Extended Foreground Colors

Date: 2026-06-26

## Status

Accepted

## Context

Modern prompts, tmux status lines, Claude Code, Codex, and syntax-colored shell
output frequently use 256-color and truecolor SGR sequences. Preserving only the
first 16 ANSI colors loses meaningful visual grouping and makes mobile terminal
output harder to scan.

## Decision

Extend `TerminalAnsiColor` beyond the original 16 ANSI colors with:

- indexed 256-color foreground values from `SGR 38;5;n`;
- truecolor foreground values from `SGR 38;2;r;g;b`.

`TerminalScreen` stores the extended foreground value in `TerminalTextAttributes`
and `TerminalSurfaceView` maps indexed colors through the xterm 256-color cube
or grayscale ramp. Truecolor values render directly through SwiftUI `Color`.

Unsupported extended background color sequences are consumed so they do not
corrupt later SGR parsing, but background color storage/rendering remains a
separate renderer slice.

## Consequences

The live terminal surface can preserve common prompt and tool foreground colors
without introducing a full terminal emulator dependency. Background colors,
underline color, faint/blink/strikethrough, palette redefinition, and exact
terminal theme mapping remain pending.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- ADR 0036: Terminal SGR Attributes.
