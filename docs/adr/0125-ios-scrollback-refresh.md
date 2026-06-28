# ADR 0125: iOS Scrollback Refresh

Date: 2026-06-28

## Status

Accepted

## Context

The iOS attach shell fetched tmux-native scrollback during attach and kept live
mosh terminal output separate from that history. That proved the data model, but
mobile users also need to refresh tmux history while staying attached without
corrupting the live screen.

## Decision

Add `AttachShellModel.refreshScrollback(lines:timeout:)`.

The refresh path fetches `session.scrollback.fetch` for the selected
device/session, replaces only the `ScrollbackBuffer`, and preserves the current
phase, selected session, attach manifest, live terminal screen, terminal output,
tick schedule, and datagram attach session.

Refresh failures are reported as recoverable snapshot errors without changing
the current phase or closing the active terminal. Error messages still pass
through the same redaction path as attach errors.

Wire the action to `HovviMobileApp` and expose a refresh button on the terminal
surface toolbar.

## Consequences

- Users can update tmux-native history without reattaching or mutating the live
  mosh screen.
- Scrollback refresh failures are visible but do not interrupt an active
  terminal session.
- The UI has a concrete scrollback refresh action before later pull-to-refresh
  or gesture polish.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileApp/HovviMobileApp.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
