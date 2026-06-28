# ADR 0120: iOS Simulator Screenshot Check

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0119 proves the temporary simulator app can be launched with deterministic
fixture data. The next useful validation is capturing an actual simulator
screenshot and checking that it is a real, nonblank PNG before adding stricter
golden-image expectations.

## Decision

Add `npm run ios:simulator-screenshot-check`.

The check:

- reuses the simulator install harness;
- launches `app.hovvi.mobile.alpha` with the deterministic attached coding-agent
  fixture;
- captures a screenshot through `xcrun simctl io <udid> screenshot`;
- parses PNG signature, IHDR, IDAT, dimensions, row filters, and pixel samples
  in Node without adding an npm dependency;
- fails if the PNG is malformed, empty, unsupported, or single-color blank;
- terminates the app and removes temporary screenshots unless
  `--keep-screenshot` is used.

This is a simulator smoke gate, not a signed app distribution step and not a
golden visual approval process.

## Consequences

- CI can now prove the app renders enough pixels to produce a nonblank
  screenshot on CoreSimulator.
- Future work can add golden image thresholds or targeted UI element checks on
  top of the same launched fixture.
- Simulator-only screenshot validation still does not close the iOS device,
  signing, hosted login, or GPL-linked mobile distribution gates.

## Validation

- `npm run check`
- `node --test test/png-image-stats.test.js test/ios-simulator-screenshot.test.js`
- `npm test`
- `node scripts/ios-simulator-screenshot-check.js --json`
- `npm run package:boundary-check`

## References

- `src/ios-simulator-screenshot.js`
- `src/png-image-stats.js`
- `scripts/ios-simulator-screenshot-check.js`
- `test/ios-simulator-screenshot.test.js`
- `test/png-image-stats.test.js`
- ADR 0119: iOS Simulator Launch Check.
