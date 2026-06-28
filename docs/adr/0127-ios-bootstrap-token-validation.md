# ADR 0127: iOS Bootstrap Token Validation

Date: 2026-06-28

## Status

Accepted

## Context

The iOS alpha bootstrap path reads relay configuration from environment
variables until hosted mobile login exists. It used the local development token
when no relay token was configured. That is acceptable for the default local
relay, but unsafe for hosted or non-local relays because a mistyped mobile
bootstrap could silently attempt to connect to a remote relay with the shared
development token.

The roadmap target remains login-based mobile access. Until that is implemented,
the alpha bootstrap boundary should fail closed for non-local relays.

## Decision

`AppBootstrapConfig` now validates relay bootstrap input:

- relay URLs must be absolute `ws` or `wss` URLs with a host;
- the development fallback token is allowed only for local relay hosts
  (`localhost`, `127.0.0.1`, or `::1`);
- non-local relays require an explicit `HOVVI_RELAY_TOKEN` or legacy
  `HOVVI_TOKEN`;
- validation messages redact relay URL credentials while preserving useful host
  context.

`HovviAppController` surfaces bootstrap validation issues as a failed
`AttachShellSnapshot` and refuses to open the relay until configuration is
fixed. Fixture mode remains unaffected.

## Consequences

- iOS alpha no longer silently uses the development relay token for remote relay
  URLs.
- Invalid relay URLs fail before network connection attempts.
- Hosted login remains a later milestone, but the current boundary now matches
  the intended fail-closed credential posture.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/AppBootstrapConfig.swift`
- `apps/ios/Sources/HovviMobileApp/HovviMobileApp.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
