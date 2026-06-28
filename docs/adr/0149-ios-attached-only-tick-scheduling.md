# ADR 0149: iOS Attached-Only Tick Scheduling

Date: 2026-06-28

## Status

Accepted

## Context

`AttachShellSnapshot.nextTickAfterMs` is a live mosh scheduling hint. It is only
meaningful while the attach shell is actively connected to a mosh session.

The iOS app already cancels receive and tick loops when snapshots leave the
attached phase, but snapshot data should carry the same invariant. Browsing,
failed, and clean-shutdown states must not retain stale tick delays that came
from an earlier live frame.

## Decision

Normalize tick scheduling inside `AttachShellModel`: `nextTickAfterMs` is
preserved only for `.attached` snapshots and is cleared for non-attached
snapshots, including remote clean shutdown, explicit user shutdown, and
recoverable attach failures.

Keep terminal screen, scrollback, selection, viewport cap, and error recovery
metadata unchanged by this normalization.

## Consequences

- Non-attached iOS snapshots cannot advertise stale mosh tick work.
- Existing loop cancellation policy remains phase-driven.
- Clean shutdown and failure snapshots still preserve the last terminal screen
  and tmux-native scrollback for reattach context.
- This does not change relay protocol, mosh packet flow, native linkage, or
  package contents.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`

## References

- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- `docs/adr/0140-ios-receive-driven-tick-cancellation.md`
- `docs/adr/0138-ios-remote-clean-shutdown-lifecycle.md`
