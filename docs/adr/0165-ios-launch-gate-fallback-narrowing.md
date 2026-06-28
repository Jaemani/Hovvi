# ADR 0165: iOS Launch Gate Fallback Narrowing

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0151 made the CI launch gate reuse the simulator app installed by the
preceding install gate before falling back to install-then-launch. That kept the
launch gate focused on execution while preserving standalone command behavior.

The fallback was still too broad: any direct launch failure triggered a fresh
install attempt. On hosted runners, a CoreSimulator launch timeout or stalled
simctl state could therefore be reported as an install failure, hiding the
actual failing operation and adding another fragile simulator action after the
install gate had already passed.

## Decision

When `iosSimulatorLaunchCheck({ reuseInstalledApp: true })` attempts a direct
launch and that launch fails, it now falls back to install-then-launch only when
the failure text indicates the app is not installed or cannot be found.

Other direct launch failures, including simctl timeouts, return immediately as
launch failures with the original diagnostics. The library default remains
install-first unless callers explicitly request installed-app reuse.

## Consequences

- CI launch failures preserve the actual failing simulator operation.
- The launch gate no longer performs a redundant reinstall after timeout-style
  direct launch failures.
- Standalone launch checks can still recover when the selected simulator does
  not have the app installed.
- This changes only simulator verification behavior. It does not change iOS app
  runtime behavior, relay protocol, native mosh linkage, package contents, or
  mobile distribution policy.

## Validation

- `node --test test/ios-simulator-launch.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`

## References

- `docs/adr/0151-ios-launch-gate-installed-app-reuse.md`
- `src/ios-simulator-launch.js`
- `scripts/ios-simulator-launch-check.js`
- `test/ios-simulator-launch.test.js`
