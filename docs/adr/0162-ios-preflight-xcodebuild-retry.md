# ADR 0162: Retry iOS Preflight Xcodebuild Probe

## Status

Accepted

## Context

CI runs iOS simulator gates in sequence. A run for commit `f68c4fc` passed the
simulator build, app bundle, install, and launch gates, then failed the
screenshot matrix because the matrix re-ran the install preflight and
`xcodebuild -version` returned `xcodebuild is not usable:` with no detail.

The earlier successful build proves full Xcode was usable in the same job. The
empty failure is consistent with a transient or slow developer-tools probe rather
than a product regression in the terminal byte decoder slice.

## Decision

`iosSimulatorPreflight` now probes `xcodebuild -version` with:

- a bounded 30 second timeout instead of the generic 5 second shell timeout;
- three attempts by default;
- a short retry delay between failed attempts;
- attempt-count diagnostics when the probe still fails.

The screenshot matrix still keeps its own fail-closed behavior. If preflight
continues to skip under `--require-captured`, CI remains failed.

## Consequences

- Slow or transient `xcodebuild -version` probes no longer contradict successful
  simulator build/install/launch evidence in the same CI job.
- Genuine missing Xcode or broken developer tools still surface as skipped
  preflight and fail required screenshot CI.
- This changes the verification harness only. It does not change the mobile app,
  terminal model, relay protocol, package contents, or release policy.

## Validation

- `node --test test/ios-preflight.test.js`
- `node --test test/ios-simulator-screenshot-matrix.test.js`
- `npm run check`
