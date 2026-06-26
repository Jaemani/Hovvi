# ADR 0040: SwiftPM iOS App Entry

Date: 2026-06-26

## Status

Accepted

## Context

`HovviMobileCore` and `HovviMobileUI` compile independently, but the iOS alpha
still needs an application entry point that wires user actions into
`AttachShellModel`. Without that layer, the shell views can be smoke-tested but
not exercised as an app-shaped attach flow.

## Decision

Add a SwiftPM executable target named `HovviMobileApp` with a SwiftUI `@main`
entry point.

The app target owns a `HovviAppController` that:

- creates a `RelayClient`;
- connects and loads devices;
- selects devices and sessions;
- attaches through `AttachShellModel`;
- forwards terminal input and resize events;
- runs a conservative receive loop while attached;
- pauses receive polling when the scene backgrounds.

For the repository alpha, relay bootstrap values come from environment variables:
`HOVVI_RELAY_URL`, `HOVVI_RELAY_TOKEN` or `HOVVI_TOKEN`, and `HOVVI_CLIENT_ID`.
Defaults target the local development relay at `ws://127.0.0.1:8787` with token
`dev`.

## Consequences

The mobile shell now has a compile-checked app wiring target without introducing
an Xcode project generator dependency. A signed iOS bundle, simulator screenshot
fixtures, hosted login, and production credential storage remain separate
release-readiness tasks.

## Validation

- `swift build --package-path apps/ios --product HovviMobileApp`
- `swift build --package-path apps/ios`
- CI runs `swift build --product HovviMobileApp` from `apps/ios`.

## References

- `apps/ios/Sources/HovviMobileApp/HovviMobileApp.swift`
- `.github/workflows/ci.yml`
- ADR 0034: SwiftUI Attach Shell Target.
- ADR 0033: iOS Attach Shell State Model.
