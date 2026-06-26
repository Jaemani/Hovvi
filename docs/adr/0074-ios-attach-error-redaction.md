# ADR 0074: iOS Attach Error Redaction

## Status

Accepted

## Context

iOS attach failures can include relay URLs, relay tokens, bearer tokens, or mosh
server keys from lower-level errors. The mobile UI must show actionable failure
state without exposing secrets.

`AttachShellError` already redacted printable mosh keys, but relay credentials
and bearer tokens needed the same treatment before reaching SwiftUI.

## Decision

`AttachShellError` now redacts:

- printable mosh keys
- relay URL username/password credentials
- inline `token=` values
- `HOVVI_RELAY_TOKEN=` values
- `Authorization: Bearer ...` values

URL host/path context is preserved after credential redaction so diagnostics
remain useful.

## Consequences

- Mobile error banners avoid common relay and mosh secret leaks.
- Redaction happens in `HovviMobileCore`, before UI rendering.
- Relay authentication, token validation, and mosh key validation are unchanged.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
