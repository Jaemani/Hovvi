# ADR 0042: Terminal Inverse Rendering

Date: 2026-06-26

## Status

Accepted

## Context

`TerminalScreen` preserved the SGR inverse flag, but the SwiftUI terminal surface
did not render it. Reverse-video styling is common in tmux status bars,
selection-like regions, prompts, and full-screen terminal tools, so preserving
the flag without displaying it left visible terminal state incomplete.

## Decision

Render inverse runs in `TerminalSurfaceView` by swapping effective foreground and
background colors. If a run does not specify both sides, use terminal-like
fallbacks: white foreground on black background for default inverse text.

The core model continues to store the raw `inverse` flag rather than mutating the
underlying foreground/background attributes. This keeps parsing reversible and
lets later theme work adjust fallback colors without changing terminal state.

## Consequences

Reverse-video output is now visible in the native renderer. Exact theme-aware
default color inversion and palette redefinition remain pending.

## Validation

- `swift build --package-path apps/ios --product HovviMobileApp`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- ADR 0036: Terminal SGR Attributes.
