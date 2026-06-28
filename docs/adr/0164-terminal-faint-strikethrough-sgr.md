# ADR 0164: Preserve faint and strikethrough terminal SGR

## Status

Accepted.

## Context

Modern command-line tools, including AI coding CLIs, frequently use dim text for
secondary status, context, and progress lines. Some terminal UIs also use
strikethrough for completed or invalidated text. Hovvi already preserved bold,
italic, underline, inverse, and color SGR runs, but ignored `SGR 2` and `SGR 9`.
That made relay-backed mobile output lose useful visual hierarchy even when the
underlying mosh/tmux bytes were correct.

## Decision

Extend `TerminalTextAttributes` with:

- `faint`, set by `SGR 2` and reset by `SGR 22`;
- `strikethrough`, set by `SGR 9` and reset by `SGR 29`.

`TerminalSurfaceLineView` renders strikethrough through SwiftUI `Text` styling
and renders faint text by lowering the effective foreground color opacity. The
core model keeps raw attributes rather than mutating stored colors, matching the
existing inverse-rendering approach.

## Consequences

- Mobile terminal output better preserves common CLI status styling.
- `SGR 22` now resets both bold and faint intensity, matching terminal
  convention.
- Blink, conceal, overline, underline color, and palette redefinition remain out
  of scope for this slice.

## Verification

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## Files

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
