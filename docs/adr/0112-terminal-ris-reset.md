# ADR 0112: Terminal RIS Reset

Date: 2026-06-28

## Status

Accepted

## Context

Terminal reset flows commonly send RIS (`ESC c`) to restore the terminal to a
known state. Without RIS, Hovvi could leave prior cursor visibility, autowrap,
application cursor-key, bracketed paste, SGR, character-set, tab-stop, alternate
screen, and scroll-region state active after a remote reset command.

## Decision

`TerminalScreen` now recognizes `ESC c` and performs a live terminal reset:

- clears the live screen and homes the cursor;
- restores default SGR attributes and ASCII character set;
- clears scroll regions, saved cursor state, custom tab stops, and alternate
  screen snapshot state;
- disables bracketed paste and application cursor-key mode;
- restores visible cursor and autowrap defaults.

tmux-native scrollback remains separate and is not mutated by RIS.

## Consequences

- Remote reset commands can recover the mobile terminal model without requiring
  a reconnect.
- Reset state is deterministic and smoke-tested.
- RIS remains scoped to the live terminal screen; history fetched from tmux is
  preserved by design.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0035: Terminal Screen Model.
- ADR 0055: Live Terminal Scrollback Separation.
