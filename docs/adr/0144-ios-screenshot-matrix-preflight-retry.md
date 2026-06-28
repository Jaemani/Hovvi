# ADR 0144: Retry transient screenshot matrix preflight skips

## Status

Accepted.

## Context

CI runs the iOS simulator gates in sequence: preflight, build, app bundle,
install, launch, and screenshot matrix. A relay-only change passed the build,
install, and launch gates, then the screenshot matrix failed because its nested
install check re-ran preflight and returned `xcodebuild is not usable:`. Since
CI runs the matrix with `--require-captured`, that skip correctly failed the
job, but the signal contradicted the immediately preceding successful simulator
gates in the same job.

The matrix still needs to fail closed when Xcode or a simulator is genuinely
unavailable. It should not silently downgrade required screenshots to skipped.

## Decision

`iosSimulatorScreenshotMatrixCheck` now retries only skipped install checks
whose reason matches `xcodebuild is not usable`. Other skipped states, such as
missing simulator availability, remain unchanged. The default is two attempts
with a short wait between attempts.

## Consequences

- A transient `xcodebuild` probe failure after successful earlier simulator
  gates gets one chance to recover.
- `--require-captured` still fails if the retry does not produce captured
  screenshots.
- Non-Xcode skips and real screenshot/assertion failures are not masked.

## Verification

- `node --test test/ios-simulator-screenshot-matrix.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
