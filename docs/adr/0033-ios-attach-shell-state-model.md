# ADR 0033: iOS Attach Shell State Model

Date: 2026-06-26

## Status

Accepted

## Context

The iOS alpha milestone needs a native user path for relay-backed attach, not
only low-level protocol helpers. The project already has Swift relay request
APIs, `MoshRelayDatagramSession`, `MoshAttachSession`, scrollback buffering, and
the C ABI mosh core boundary. The missing layer is a UI-consumable state model
that coordinates device browsing, session selection, scrollback loading, attach,
terminal input/output, resize, shutdown, and user-facing errors.

Scaffolding a full Xcode app before this state model would make terminal UI work
harder to test and would risk mixing view layout decisions with attach lifecycle
logic.

## Decision

Add `AttachShellModel` to `HovviMobileCore`.

The model is an actor that exposes `AttachShellSnapshot` values for native UI
binding. It:

- connects to the relay and loads devices;
- tracks selected device and session;
- fetches tmux scrollback before attach;
- prepares an attach manifest;
- creates a relay datagram session and `MoshAttachSession`;
- applies terminal output into `ScrollbackBuffer`;
- forwards input, resize, receive, and shutdown actions;
- turns recoverable failures into redacted `AttachShellError` values.

The default engine factory creates `CAbiMoshCoreEngine`, while tests can inject a
fake `MoshCoreEngine`. The model redacts mosh server keys from user-facing error
messages.

## Consequences

The first SwiftUI app shell can bind to a deterministic core state object instead
of reimplementing attach sequencing in views. The milestone still needs a real
native terminal renderer and simulator/device validation before iOS alpha is
complete.

This does not close the GPL mobile distribution gate. The Swift package still
links the unavailable scaffold by default.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileCore/MoshAttachSession.swift`
- `apps/ios/Sources/HovviMobileCore/ScrollbackBuffer.swift`
- ADR 0024: Mobile Mosh Attach Coordinator.
- ADR 0029: Swift C ABI Mosh Core Engine.
- ADR 0032: Conservative Reconnecting Relay Client.
