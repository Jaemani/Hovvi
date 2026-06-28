# ADR 0117: iOS Simulator App Bundle Harness

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0116 proved that the SwiftPM `HovviMobileApp` scheme compiles for iOS
simulator and produces a simulator executable artifact on full-Xcode hosts.
Simulator screenshot execution still needs an installable `.app` shape, while a
signed iOS/Xcode distribution target remains a separate roadmap item and
decision-sensitive release concern.

## Decision

Add `npm run ios:simulator-app-bundle-check`.

The check:

- reuses the simulator build check with derived data preserved long enough to
  access the built simulator artifact;
- skips when simulator build preflight skips;
- creates a temporary `HovviMobileApp.app` simulator bundle from the SwiftPM
  executable artifact;
- writes a minimal simulator `Info.plist` and `PkgInfo`;
- fails if the build check fails, the artifact path is not absolute, or the
  bundle cannot be created;
- deletes temporary bundle and derived data unless `--keep-bundle` is passed.

This is a simulator harness only. It does not sign, distribute, notarize, or
package a mobile app, and it does not link the shipped app to GPL upstream mosh
artifacts.

## Consequences

- Future simulator screenshot automation can start from an executable `.app`
  bundle shape rather than only a SwiftPM executable.
- CI can now verify the app-bundle harness on full-Xcode hosts.
- A production iOS app target, signing, source-availability notices, and any
  GPL-linked mobile distribution decision remain pending.

## Validation

- `npm run check`
- `npm test`
- `node scripts/ios-simulator-app-bundle-check.js --json`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `src/ios-simulator-app-bundle.js`
- `scripts/ios-simulator-app-bundle-check.js`
- `test/ios-simulator-app-bundle.test.js`
- ADR 0116: iOS Simulator Build Check.
