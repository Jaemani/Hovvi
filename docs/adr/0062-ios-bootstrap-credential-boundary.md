# ADR 0062: iOS Bootstrap Credential Boundary

## Status

Accepted

## Context

The iOS alpha app can connect to a relay through environment-provided bootstrap
values, but the parsing lived inside the executable target and was not covered
by smoke tests. The product target is a login-based mobile experience, while the
current repository still needs a local alpha path for relay development.

The app must not blur those two modes. A development default token is acceptable
for local alpha builds, but token source, redaction, and future replacement by
hosted login need a stable model outside the SwiftUI executable.

## Decision

Add `AppBootstrapConfig` to `HovviMobileCore`.

The config parses:

- `HOVVI_RELAY_URL`, defaulting to `ws://127.0.0.1:8787`;
- `HOVVI_RELAY_TOKEN`;
- legacy `HOVVI_TOKEN`;
- `HOVVI_CLIENT_ID`, defaulting to `ios-alpha`.

It records the credential source as `HOVVI_RELAY_TOKEN`, `HOVVI_TOKEN`, or
`development-default`, exposes whether the development fallback is in use, and
provides redacted token text for diagnostics. `HovviMobileApp` consumes this
Core-owned config instead of keeping a private executable-only parser.

This does not select a hosted relay retention, paid policy, token lifetime, or
OAuth account model. It only creates the testable boundary that hosted login can
replace.

## Consequences

- Swift smoke tests cover bootstrap URL, token precedence, client id, fallback
  mode, and token redaction.
- Future sign-in UI can depend on a Core bootstrap/auth boundary instead of
  duplicating environment parsing in the app target.
- Development fallback remains explicit and observable rather than silently
  indistinguishable from a real credential.
- Hosted login remains a separate roadmap milestone and decision area.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
