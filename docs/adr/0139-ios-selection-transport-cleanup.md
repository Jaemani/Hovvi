# ADR 0139: iOS Selection Transport Cleanup

## Status

Accepted.

## Context

The iOS attach shell closes stale relay datagram transports on reconnect,
reattach, interruption, and shutdown. Device/session selection changes could
move the model from `attached` back to browsing while leaving the previous
`MoshAttachSession` alive until a later attach or reconnect.

That leaves a stale relay datagram channel after the user has changed the
selected target.

## Decision

Treat a successful device or session selection change as an attach lifecycle
boundary:

- selecting the currently attached target is a no-op and keeps the terminal
  attached;
- selecting a different valid target closes the current relay datagram
  transport best-effort, clears the active mosh session, and returns to
  browsing;
- invalid selection also closes any active attach transport before surfacing the
  recoverable selection error.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## Consequences

Changing the target Mac or tmux session no longer leaves the old mosh relay
channel alive. The attached session remains stable when the user re-selects the
same current session.
