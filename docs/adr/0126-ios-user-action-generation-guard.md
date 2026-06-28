# ADR 0126: iOS User Action Generation Guard

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0124 guarded receive and tick loops by attach generation, but top-level user
actions in `HovviAppController` still published snapshots from independent
async tasks. A slow relay connect, session selection, attach, or scrollback
refresh could finish after a newer user action and overwrite the newer UI state.

This is most visible on mobile because users can background the app, reconnect,
change sessions, or tap attach again while older relay operations are still
waiting on network timeouts.

## Decision

Track a separate user action generation in `HovviAppController`.

Exclusive state-changing actions increment the generation before launching their
async work:

- relay connect and device reload;
- device selection;
- session selection;
- attach;
- scrollback refresh.

Input and resize operations capture the current generation without incrementing
it. Their results are still discarded if a newer exclusive action starts before
they complete.

Device and session selection also cancel the active attach receive/tick loops
before changing the selected target. That prevents the previously attached
session from publishing more loop snapshots after the user has moved selection
to a different target.

Expose the generation comparison through
`AttachShellLifecyclePolicy.shouldApplyUserActionSnapshot` and cover it in the
Swift smoke harness.

## Consequences

- Stale user action snapshots can no longer overwrite a newer connect, attach,
  session selection, or scrollback refresh state.
- Rapid input and resize operations do not invalidate each other, but they are
  still prevented from publishing after a newer exclusive action starts.
- Selecting a different Mac or session stops the previous attach loops before
  the selected target changes.
- The guard rejects only stale UI publications. The underlying actor operation
  may still complete and update model state.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileApp/HovviMobileApp.swift`
- `apps/ios/Sources/HovviMobileCore/AttachShellLifecyclePolicy.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
