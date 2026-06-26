# ADR 0056: iOS Attach Recovery Actions

## Status

Accepted

## Context

The iOS alpha shell can reach failures from two different places:

- relay browsing and device loading before a terminal is attached;
- live attach operations after a mosh datagram session has been opened.

Both previously collapsed into the same `.failed` state with a generic retry
button. That makes a terminal interruption look like a relay-login problem and
can leave UI code guessing whether to reconnect to the relay or reattach the
selected session.

## Decision

`AttachShellSnapshot` now carries an optional `AttachShellRecoveryAction`:

- `.connectRelay` for relay/device-loading failures;
- `.reattachSession` for attach, input, resize, receive, tick, and shutdown
  failures tied to a selected terminal session.

Active attach failures invalidate the current `MoshAttachSession` and make a
best-effort `closeTransport()` call so the relay datagram channel is closed even
when the mosh core cannot complete a clean shutdown.

`HovviMobileApp` routes retry through the recovery action. SwiftUI labels the
button as reconnect or reattach instead of exposing one ambiguous retry path.

## Consequences

- Recoverable errors remain user-facing without exposing mosh keys.
- The selected Mac/session, tmux scrollback, and last live terminal screen are
  preserved after an interrupted attach.
- Retrying a live terminal failure starts a new attach attempt instead of only
  reloading devices.
- This is still conservative: failed stateful operations are not silently
  retried in place.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
