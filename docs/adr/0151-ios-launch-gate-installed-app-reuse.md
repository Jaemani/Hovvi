# ADR 0151: iOS Launch Gate Installed App Reuse

Date: 2026-06-28

## Status

Accepted

## Context

CI runs simulator gates in order: preflight, build, app bundle, install, launch,
and screenshot matrix. The launch gate previously called the install gate
unconditionally, which rebuilt and reinstalled the app even when the immediately
previous CI step had already installed the same simulator bundle.

That made the launch gate vulnerable to unrelated repeated `xcodebuild` or
CoreSimulator flakes after the build, bundle, and install gates had already
passed. The gate should prove that CoreSimulator can execute the app, not
re-prove the full build and install pipeline when prior gates in the same job
already did that.

## Decision

The `ios:simulator-launch-check` CLI now asks the launch harness to reuse an
already installed simulator app first. When preflight finds an available
simulator, the harness attempts `simctl launch` with the deterministic fixture
before invoking the install check.

If that direct launch succeeds, the launch gate returns `launched` and records
`reusedInstalledApp: true`. If direct launch fails, the harness falls back to the
existing install-then-launch path so the command still works when run standalone.

The library default remains the original install-first behavior unless callers
explicitly set `reuseInstalledApp: true`.

## Consequences

- CI launch evidence is focused on app execution after the install gate instead
  of adding a redundant build/install cycle.
- Standalone launch checks still build, bundle, install, and launch when needed.
- A genuinely missing or stale installed app falls back to the existing
  install-then-launch verifier.
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

- `src/ios-simulator-launch.js`
- `scripts/ios-simulator-launch-check.js`
- `test/ios-simulator-launch.test.js`
- `docs/adr/0135-simulator-launch-screenshot-internal-timeouts.md`
