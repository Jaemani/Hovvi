# ADR 0121: iOS Simulator Screenshot Matrix

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0120 proves one deterministic attached fixture can launch and produce a
nonblank CoreSimulator PNG. The iOS alpha shell also has deterministic browsing
and failed attach states. A single attached screenshot is too narrow to catch
render regressions in the device/session list, recovery UI, or terminal state
variants.

## Decision

Add `npm run ios:simulator-screenshot-matrix-check`.

The matrix check:

- installs the temporary SwiftPM simulator app bundle once;
- launches the app separately for `browsing`, `attached-coding-agent`,
  `failed-attach`, and `capped-viewport` fixtures using
  `HOVVI_IOS_SNAPSHOT_FIXTURE`;
- captures and validates a nonblank PNG for each fixture;
- records PNG byte length and SHA-256 metadata for each fixture capture;
- requires fixture screenshots to have distinct hashes by default, catching
  selector regressions before pixel-perfect golden assertions exist;
- writes stable screenshot paths under `--output-dir=<path>`;
- writes one JSON metadata artifact with fixture names, simulator identity,
  per-fixture screenshot paths, and PNG statistics;
- uploads the PNG set and metadata JSON from CI;
- retries CoreSimulator device discovery briefly before deciding the simulator
  environment is unavailable, because GitHub-hosted macOS runners can restart
  CoreSimulator services between earlier install/launch gates and the matrix
  gate;
- runs with `--require-captured` in CI so skipped screenshot evidence fails the
  workflow instead of silently passing without CoreSimulator artifacts.

This remains a simulator smoke gate. It does not decide golden-image thresholds,
does not create a signed app target, and does not distribute a mobile app linked
against upstream mosh.

## Consequences

- CI now exercises the shell's browsing, attached coding-agent, failed recovery,
  and capped terminal viewport surfaces on CoreSimulator.
- Simulator install/build cost is paid once for the matrix instead of once per
  fixture.
- Transient `simctl list` failures remain visible after bounded retry, while
  deterministic CI artifact requirements stay fail-closed through
  `--require-captured`.
- Future visual assertions can compare against matrix metadata and fixture
  names instead of adding ad hoc screenshot scripts.
- Exact golden image baselines remain deferred, but duplicate fixture images now
  fail the matrix check.
- Local developer runs can still skip when full Xcode or a simulator is missing,
  while CI must produce the artifact evidence.

## Validation

- `npm run check`
- `node --test test/ios-preflight.test.js test/ios-simulator-screenshot-matrix.test.js test/ios-simulator-screenshot.test.js`
- `node scripts/ios-simulator-screenshot-matrix-check.js --json --metadata=/tmp/hovvi-ios-screenshot-matrix.json`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`

## References

- `src/ios-simulator-screenshot-matrix.js`
- `scripts/ios-simulator-screenshot-matrix-check.js`
- `test/ios-simulator-screenshot-matrix.test.js`
- ADR 0120: iOS Simulator Screenshot Check.
