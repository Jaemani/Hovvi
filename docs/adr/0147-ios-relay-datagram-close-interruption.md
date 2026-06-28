# ADR 0147: iOS Relay Datagram Close Interruption

Date: 2026-06-28

## Status

Accepted

## Context

The Swift relay datagram session correctly treats a relay `datagram.close` frame
as the end of the channel and clears its connected channel id. However,
`MoshAttachSession.receiveNext` reports that condition as `nil`, and
`AttachShellModel.receiveNext` previously treated `nil` as no new terminal
output.

That left the UI in the attached phase after the relay or agent had already
closed the datagram channel. Later input, resize, or tick work could then run
against a stale mosh session until another operation failed.

## Decision

Treat a relay datagram close before a mosh clean-shutdown frame as a recoverable
terminal interruption in `AttachShellModel.receiveNext`.

When `MoshAttachSession.receiveNext` returns `nil`, the attach model now closes
the transport best-effort, clears the active mosh session, preserves the current
device, session, scrollback, and live terminal screen, and moves the snapshot to
`failed` with `reattachSession` recovery.

The relay close path stays distinct from mosh clean shutdown. A clean shutdown
still comes from the core frame and returns the shell to browsing with
`cleanShutdown` set.

## Consequences

- The mobile shell no longer remains attached after the relay datagram channel
  closes unexpectedly.
- Users see the same reattach-oriented recovery path used for interrupted
  receive errors.
- The model does not send a duplicate close when the relay has already closed
  and the Swift datagram session has cleared its channel id.
- This does not change the relay wire format or weaken datagram validation.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`

## References

- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileCore/MoshAttachSession.swift`
- `apps/ios/Sources/HovviMobileCore/MoshRelayDatagramSession.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
