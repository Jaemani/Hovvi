# ADR 0122: iOS Capped Viewport Fixture

Date: 2026-06-28

## Status

Accepted

## Context

The iOS alpha shell already had terminal surface viewport projection tests and
documentation claiming capped viewport fixture coverage. The simulator fixture
selector, however, did not expose a `capped-viewport` state, and the SwiftUI
terminal surface used the default projection cap instead of a fixture-level cap.
That made the capped viewport state unrenderable through simulator screenshots.

## Decision

Add an optional `terminalViewportLineLimit` to `AttachShellSnapshot`.

The default is `nil`, preserving existing production behavior. The
`capped-viewport` preview fixture sets the cap to 8 rows and uses cap-specific
live terminal rows so simulator screenshot artifacts visibly differ from the
uncapped attached fixture. `TerminalSurfaceProjection.viewport(for:)` uses this
snapshot cap when callers do not provide an explicit limit.

Add `capped-viewport` to the deterministic iOS simulator screenshot matrix.

## Consequences

- Simulator screenshots now exercise the capped terminal viewport state instead
  of only testing the projection helper in smoke tests.
- The fixture is intentionally visually distinct from `attached-coding-agent`,
  so matrix duplicate-image checks can catch accidental selector or fixture
  regressions.
- Production snapshots remain uncapped unless an explicit state sets a limit.
- The cap is part of the UI-facing snapshot contract, so future hosted/mobile
  view models can request dense render windows without changing terminal
  scrollback or live screen state.

## Validation

- `node --test test/ios-simulator-screenshot-matrix.test.js`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellPreviewFixtures.swift`
- `src/ios-simulator-screenshot-matrix.js`
