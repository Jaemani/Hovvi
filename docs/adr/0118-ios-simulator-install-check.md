# ADR 0118: iOS Simulator Install Check

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0117 creates a temporary simulator `.app` bundle from the SwiftPM
`HovviMobileApp` simulator artifact. Before screenshot automation can be useful,
the harness must also prove that this bundle is installable on an iOS simulator
on full-Xcode hosts.

## Decision

Add `npm run ios:simulator-install-check`.

The check:

- reuses the simulator app-bundle harness with bundle retention enabled;
- skips when simulator preflight or build prerequisites skip;
- boots the selected simulator, tolerating an already-booted state;
- waits for `simctl bootstatus -b`;
- installs `HovviMobileApp.app` with `simctl install`;
- cleans temporary bundle and derived data when done.

This remains a simulator-only validation harness. It does not sign or distribute
a mobile app and does not change GPL-linked mobile packaging policy.

## Consequences

- CI can now prove the generated app-bundle shape is accepted by CoreSimulator.
- Screenshot automation can build on an installed app instead of a file-only
  bundle check.
- Production iOS signing, App Store distribution, device install, and
  GPL-linked mobile release decisions remain pending.

## Validation

- `npm run check`
- `npm test`
- `node scripts/ios-simulator-install-check.js --json`
- `npm run package:boundary-check`

## References

- `src/ios-simulator-install.js`
- `scripts/ios-simulator-install-check.js`
- `test/ios-simulator-install.test.js`
- ADR 0117: iOS Simulator App Bundle Harness.
