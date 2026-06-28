# ADR 0148: iOS Viewport Cap State Preservation

Date: 2026-06-28

## Status

Accepted

## Context

`AttachShellSnapshot.terminalViewportLineLimit` is part of the UI-facing mobile
terminal contract. It lets deterministic fixtures and future mobile state
restoration request a bounded terminal render window without changing tmux-native
scrollback or the live mosh screen.

Some `AttachShellModel` transitions preserved this field, but others rebuilt the
snapshot without carrying it forward. That made the cap fragile across normal
attach lifecycle events such as connect, selection, attach, input, clean
shutdown, and recoverable failure.

## Decision

Preserve `terminalViewportLineLimit` across all `AttachShellModel` state
transitions that retain the same terminal shell context.

Add an `initialSnapshot` parameter to `AttachShellModel` with a default empty
snapshot. Production construction remains unchanged, while tests and future
state restoration can seed a UI-facing snapshot and verify that lifecycle
transitions preserve bounded viewport intent.

## Consequences

- Mobile terminal viewport caps no longer disappear during attach lifecycle
  transitions.
- The model keeps the viewport cap as snapshot metadata only; it does not trim
  scrollback or mutate live terminal state.
- Existing app startup behavior is unchanged because the default initial
  snapshot remains disconnected and uncapped.
- This does not change relay protocol, attach manifests, native mosh linkage, or
  package contents.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`

## References

- `apps/ios/Sources/HovviMobileCore/AttachShellModel.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- `docs/adr/0122-ios-capped-viewport-fixture.md`
