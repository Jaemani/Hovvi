# ADR 0039: Terminal Background Colors

Date: 2026-06-26

## Status

Accepted

## Context

Terminal applications use background colors for selection-like regions, tmux
status bars, command palettes, diagnostics, and agent approval prompts.
Foreground-only SGR support preserves text color but loses these important
layout cues on mobile.

## Decision

Extend `TerminalTextAttributes` with a background color and preserve:

- standard background colors from `SGR 40-47`;
- bright background colors from `SGR 100-107`;
- indexed 256-color backgrounds from `SGR 48;5;n`;
- truecolor backgrounds from `SGR 48;2;r;g;b`;
- background reset from `SGR 49`.

`TerminalSurfaceView` now renders each line as zero-spacing styled runs instead
of one concatenated `Text`, allowing SwiftUI to apply run-level backgrounds
while keeping monospaced terminal layout.

## Consequences

The live terminal surface can now preserve common tmux and full-screen tool
background styling. Text selection remains best-effort because run-level
background rendering uses a composed view rather than a single `Text` value.
Palette redefinition, underline colors, reverse-video color swapping, and
theme-aware contrast adjustments remain pending.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- ADR 0038: Terminal Extended Foreground Colors.
