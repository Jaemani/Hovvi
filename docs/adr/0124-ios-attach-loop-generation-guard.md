# ADR 0124: iOS Attach Loop Generation Guard

Date: 2026-06-28

## Status

Accepted

## Context

`HovviMobileApp` runs receive and tick loops while an attach session is active.
Those loops can overlap lifecycle transitions: foreground/background changes,
explicit reattach, reconnect, or retry can cancel the old loop and start a new
attach generation while the old async receive or tick call is still returning.

Without a generation check, a stale loop can publish an outdated snapshot after
the app has already moved to a newer attach lifecycle. The receive loop also
needed to clear its task handle when it exits, matching the existing tick-loop
cleanup behavior.

## Decision

Track the current attach-loop generation and apply snapshots from receive and
tick tasks only when the task generation still matches the controller
generation.

Expose the generation comparison through `AttachShellLifecyclePolicy` so the
invariant is covered by `HovviMobileCoreSmoke` instead of being only an app
implementation detail.

The receive loop now clears its task handle on exit when it still owns the
current generation. The tick loop uses the same generation guard before
publishing snapshots.

## Consequences

- Reconnect, reattach, retry, and background/resume transitions cannot be
  overwritten by stale receive or tick loop results from an older attach
  generation.
- Recoverable failures from the active generation still surface to SwiftUI; the
  guard rejects only stale generations, not failed phases from the current
  generation.
- The app target keeps lifecycle ownership while the core policy exposes the
  testable invariant.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileApp/HovviMobileApp.swift`
- `apps/ios/Sources/HovviMobileCore/AttachShellLifecyclePolicy.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
