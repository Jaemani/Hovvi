# ADR 0075: iOS Attach Lifecycle Cleanup

## Status

Accepted

## Context

The iOS attach model can move from an attached terminal back to relay browsing
when the user reconnects, and can also start an explicit reattach while a
terminal is already attached.

Before this decision, those paths replaced UI-facing snapshot state but did not
guarantee that the old mosh relay datagram transport was closed or that the old
`MoshAttachSession` was detached before the next operation. That could leak a
datagram channel and allow stale input to reach an old session after reconnect.

## Decision

`AttachShellModel` now closes any current attach transport best-effort before:

- reconnecting and loading devices
- starting a new attach or reattach operation

The cleanup clears the model's current `MoshAttachSession` before the next
lifecycle starts. User-requested shutdown still uses the explicit shutdown path
so shutdown errors remain user-facing.

## Consequences

- Reconnect returns to browsing without retaining a stale attach session.
- Explicit reattach closes the previous relay datagram transport before opening
  a new one.
- Cleanup failures during reconnect or reattach do not block the new user action;
  they remain best-effort because the next lifecycle is the recovery path.
- Normal shutdown semantics are unchanged.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
