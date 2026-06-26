# ADR 0072: iOS Attach Selection Validation

## Status

Accepted

## Context

The iOS alpha attach flow depends on a stable sequence:

1. load relay devices
2. select a Mac
3. select an attachable session
4. prepare scrollback and mosh relay attach

`AttachShellModel` previously accepted arbitrary device and session identifiers.
It also preserved selected identifiers across device-list reloads without
checking whether the selected Mac or session still existed. That could leave the
mobile shell pointing at stale relay state before attach.

## Decision

`AttachShellModel` now validates selections against the current device snapshot:

- selecting a missing Mac fails with a reconnect/refresh recovery action
- selecting a missing session on the selected Mac fails with a reconnect/refresh
  recovery action
- valid selections recover the model back to browsing
- device-list reloads preserve valid selections, replace stale session
  selections with the first available session on the selected Mac, and clear
  stale Mac selections

## Consequences

- The mobile shell will not prepare attach requests for sessions that are not in
  the current relay device snapshot.
- Stale relay state is surfaced as a recoverable UI state before attach.
- The change does not alter relay protocol, authentication, attach manifest
  schema, mosh key validation, or native mosh behavior.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
