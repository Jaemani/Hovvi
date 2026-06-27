# ADR 0116: iOS Simulator Build Check

Date: 2026-06-28

## Status

Accepted

## Context

The iOS alpha needs simulator or device rendering validation before it can be
treated as complete. Hovvi already has deterministic fixture mode and a
simulator preflight, but there was no executable check proving that the SwiftUI
app target can produce an iOS simulator app artifact on hosts with full Xcode.

The local development host can have only Command Line Tools active, while CI or
other Macs may have full Xcode and available iOS simulators. The check must
advance simulator validation without making CLT-only development unusable.

## Decision

Add `npm run ios:simulator-build-check`.

The check:

- reuses `iosSimulatorPreflight`;
- skips when full Xcode or an available iOS simulator is missing;
- on ready hosts, runs `xcodebuild` from `apps/ios` for SwiftPM package scheme
  `HovviMobileApp` against the selected simulator UDID;
- fails if `xcodebuild` fails or if `HovviMobileApp.app` is not found in
  derived data products;
- keeps derived data only when `--keep-derived-data` is passed.

CI runs this check after simulator preflight. On CLT-only hosts it is a no-op
skip; on full-Xcode hosts it becomes a real simulator artifact gate.

## Consequences

- Simulator screenshot automation has a concrete predecessor gate: app artifact
  production.
- The check does not introduce signing, App Store, hosted login, or GPL-linked
  mobile distribution decisions.
- Local CLT-only contributors can still run the default verification suite.

## Validation

- `npm run check`
- `npm test`
- `node scripts/ios-simulator-preflight.js --json`
- `node scripts/ios-simulator-build-check.js --json`

## References

- `src/ios-simulator-build.js`
- `scripts/ios-simulator-build-check.js`
- `test/ios-simulator-build.test.js`
- ADR 0061: iOS Simulator Rendering Preflight.
- ADR 0082: iOS Screenshot Fixture Mode.
