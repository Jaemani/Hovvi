# ADR 0034: SwiftUI Attach Shell Target

Date: 2026-06-26

## Status

Accepted

## Context

The iOS alpha milestone needs a real native shell for browsing Macs, selecting
sessions, attaching, and viewing terminal output. `AttachShellModel` now owns the
attach lifecycle and exposes `AttachShellSnapshot`, but there was no UI target
that compiled against that contract.

The project should avoid putting relay or mosh lifecycle logic inside SwiftUI
views. The first UI slice should prove the native surface can bind to the state
model while leaving rendering quality and simulator/device validation for the
terminal-focused slices.

## Decision

Add `HovviMobileUI` as a SwiftPM library target.

The target contains presentational SwiftUI views:

- `HovviAttachShellView`
- `DeviceSidebar`
- `DeviceRow`
- `SessionRow`
- `TerminalDetail`
- `TerminalSurfaceView`
- `ErrorBanner`

The views render `AttachShellSnapshot`, call closures for user actions, show
device/session lists, show redacted recoverable errors, and provide a first
scrolling terminal surface backed by `ScrollbackBuffer.visibleLines`.

`HovviMobileCoreSmoke` imports `HovviMobileUI` and instantiates the public views
so CI continuously compiles the UI target. It does not claim simulator or device
rendering quality yet.

## Consequences

The future Xcode app target can start from tested SwiftUI surfaces instead of
inventing a separate UI contract. Terminal quality remains an open milestone:
ANSI parsing, keyboard ergonomics, paste behavior, live-screen preservation, and
simulator/device screenshots still need explicit validation.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- ADR 0033: iOS Attach Shell State Model.
