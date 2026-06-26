# ADR 0061: iOS Simulator Rendering Preflight

## Status

Accepted

## Context

The first iOS rendering baseline now has deterministic attach shell fixtures,
but simulator screenshot execution requires a full Xcode installation and
`simctl`. The current local machine reports an active developer directory under
`/Library/Developer/CommandLineTools`, so `xcodebuild` and `simctl` cannot run
device or simulator workflows even though SwiftPM builds still work.

CI should keep this distinction visible. Treating missing Xcode as a generic
test failure would hide whether the code is broken or the host is simply not a
simulator-capable Mac. Treating it as success without a record would make the
iOS alpha rendering gate easy to miss.

## Decision

Add `iosSimulatorPreflight` and `npm run ios:simulator-preflight`.

The preflight:

- returns `skipped` on non-macOS hosts;
- returns `skipped` when only Command Line Tools are active;
- returns `skipped` when `xcodebuild`, `xcrun`, or `simctl` is unusable;
- returns `ready` only when full Xcode is active and at least one available iOS
  simulator is reported by `xcrun simctl list devices available --json`.

The default command exits zero for both `ready` and `skipped` so CI records the
state without blocking unrelated SwiftPM and native checks. `--require-ready`
exists for a later screenshot job that must fail when simulator execution is not
available.

## Consequences

- CI now records whether the host can run future simulator rendering tests.
- The iOS alpha milestone remains open until an actual simulator or device
  screenshot execution job runs.
- Local contributors can distinguish "install/select full Xcode" from Swift
  compiler or app build failures.
- The preflight does not create an Xcode project, sign an app, boot a simulator,
  or distribute a GPL-linked mobile binary.

## Validation

- `npm run check`
- `npm test`
- `npm run ios:simulator-preflight`
