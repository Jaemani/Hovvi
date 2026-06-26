# ADR 0051: iOS Mosh Tick Loop

## Status

Accepted

## Context

`MoshAttachSession` already exposed `tick(nowMs:)`, and the native C ABI carries
`nextTickAfterMs` so upstream mosh can schedule retransmit, ack, prediction, and
shutdown progress. The iOS attach shell surfaced that value in
`AttachShellSnapshot`, but `HovviMobileApp` only ran a receive loop. A mobile
attach could therefore process input and received datagrams while failing to
drive scheduled mosh timers.

## Decision

Add `AttachShellModel.tick(nowMs:)` and have it apply tick frames through the
same snapshot path used by attach, input, resize, receive, and shutdown.

`HovviMobileApp` now starts a conservative tick loop while attached. The loop
uses `nextTickAfterMs` when the engine provides it and otherwise polls every
250 ms while the session remains attached. The loop is cancelled with the
receive loop when reconnecting, reattaching, or entering the background.

## Consequences

- The mobile attach shell now drives the full mosh core frame lifecycle instead
  of only reacting to user input and relay datagrams.
- Tick output, outbound datagrams, `nextTickAfterMs`, and clean shutdown state
  flow through the same redacted snapshot surface as other attach actions.
- The 250 ms fallback is intentionally conservative for alpha. It avoids missing
  a later tick schedule after input or receive without introducing a tight loop.
- Device/simulator lifecycle validation remains required before the iOS alpha
  milestone is complete.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
