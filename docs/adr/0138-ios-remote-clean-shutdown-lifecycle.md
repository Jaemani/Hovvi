# ADR 0138: iOS Remote Clean Shutdown Lifecycle

## Status

Accepted.

## Context

The iOS attach shell already surfaced `cleanShutdown` from mosh core frames, and
explicit user shutdown returned the shell to browsing. Remote or engine-driven
clean shutdown frames could still pass through the generic frame apply path
while leaving the model in `attached` with a stale `MoshAttachSession`.

That is a core attach lifecycle gap: receive, input, resize, and tick all share
the frame path, and any of them may surface clean shutdown once the upstream
engine reports session completion.

## Decision

Make `AttachShellModel` treat a clean shutdown frame as terminal lifecycle
completion outside the explicit shutdown command:

- preserve final terminal output and screen state;
- close the relay datagram transport best-effort;
- clear the active mosh session;
- return the shell to `browsing`;
- clear future tick scheduling;
- keep `cleanShutdown` visible in the snapshot.

Explicit `shutdown()` still owns its transport close through `MoshAttachSession`
and then returns to browsing.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## Consequences

The iOS attach loops can stop on core-reported clean shutdown instead of
continuing to poll or send input through a stale relay datagram channel. This
keeps remote completion behavior aligned with explicit user shutdown without
adding UI-only behavior.
