# ADR 0119: iOS Simulator Launch Check

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0118 proves the temporary `HovviMobileApp.app` bundle can be installed on
CoreSimulator. The next simulator screenshot prerequisite is proving the app can
actually launch under CoreSimulator with deterministic fixture data, without
starting a relay or crossing mobile distribution/signing policy.

## Decision

Add `npm run ios:simulator-launch-check`.

The check:

- reuses the simulator install harness;
- skips when simulator preflight, build, bundle, or install prerequisites skip;
- launches `app.hovvi.mobile.alpha` with `simctl launch`;
- injects `HOVVI_IOS_SNAPSHOT_FIXTURE=attached-coding-agent` through the
  `SIMCTL_CHILD_` environment prefix;
- terminates the launched app best-effort after launch returns.

This remains a simulator-only validation harness. It does not create a signed
distribution bundle, does not distribute a mobile app, and does not change the
GPL-linked mobile packaging decision gate.

## Consequences

- CI can now prove the simulator bundle is both installable and executable.
- Screenshot automation can depend on a launched deterministic attach shell.
- Pixel assertions, device installation, production signing, hosted login, and
  GPL-linked mobile distribution remain pending.

## Validation

- `npm run check`
- `npm test`
- `node scripts/ios-simulator-launch-check.js --json`
- `npm run package:boundary-check`

## References

- `src/ios-simulator-launch.js`
- `scripts/ios-simulator-launch-check.js`
- `test/ios-simulator-launch.test.js`
- ADR 0118: iOS Simulator Install Check.
