# ADR 0080: iOS Terminal Auto-Follow Gate

## Status

Accepted

## Context

Mobile terminal output should follow live output while a user is actively
watching the session. The same behavior becomes harmful when the user scrolls up
to inspect tmux-native scrollback or earlier live rows: every new terminal row
can force the surface back to the bottom.

The previous `TerminalSurfaceView` scrolled to the newest anchor on every anchor
change, with no UI or testable policy gate.

## Decision

`TerminalSurfaceView` now keeps an explicit `followsLiveOutput` state.

When follow mode is enabled, anchor changes scroll to the bottom. When follow
mode is disabled, the surface holds the current scroll position while live
output continues to update.

The decision logic lives in `TerminalAutoFollowPolicy` so smoke tests can prove
that unchanged anchors, empty viewports, and disabled follow mode do not trigger
bottom scrolling.

## Consequences

- Users can pause auto-follow before reading scrollback.
- Live output still follows by default for normal attach use.
- Auto-follow behavior is deterministic and covered outside SwiftUI rendering.
- Future simulator/device checks can add gesture-based validation on top of the
  policy gate.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
