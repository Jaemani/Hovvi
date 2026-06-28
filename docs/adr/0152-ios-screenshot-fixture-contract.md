# ADR 0152: iOS Screenshot Fixture Contract

Date: 2026-06-28

## Status

Accepted

## Context

The simulator screenshot matrix already captures deterministic iOS fixtures,
rejects blank or low-variation images, rejects duplicate fixture images, and
stores semantic expectations in the matrix artifact. Those expectations were
defined in JavaScript only, so they could drift from the Swift preview fixtures
that actually render the app states.

For the iOS alpha attach shell, screenshot evidence should prove more than
"some pixels changed." Each fixture must remain tied to a specific app state:
device/session browsing, relay-backed terminal attach, recoverable attach
failure, and capped mobile terminal viewport.

## Decision

The screenshot fixture contract now lives in
`docs/ios-screenshot-fixtures.json`. JavaScript screenshot matrix defaults load
fixture names and semantic expectations from that contract.

Swift preview fixtures expose matching `ScreenshotFixtureExpectation` values and
a `semanticSignals(for:)` projection. `HovviMobileCoreSmoke` reads the same JSON
contract and verifies that every contract fixture:

- resolves to a Swift preview snapshot,
- has matching Swift role/state/required-signal metadata,
- has a snapshot phase matching the declared state, and
- exposes every required semantic signal from actual snapshot content.

## Consequences

- Screenshot fixture metadata has one repository contract instead of duplicated
  JavaScript-only truth.
- Swift smoke catches fixture drift before simulator screenshots produce
  misleading artifacts.
- Simulator screenshot checks still validate image existence, nonblank content,
  variation, and distinct hashes; this adds a semantic fixture verifier before
  exact golden image baselines.
- This does not change app runtime behavior, relay protocol, native mosh
  linkage, npm package license boundaries, or mobile distribution policy.

## Validation

- `node --test test/ios-simulator-screenshot-matrix.test.js`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `npm run check`
- `npm test`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`

## References

- `docs/ios-screenshot-fixtures.json`
- `src/ios-simulator-screenshot-matrix.js`
- `apps/ios/Sources/HovviMobileUI/AttachShellPreviewFixtures.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
