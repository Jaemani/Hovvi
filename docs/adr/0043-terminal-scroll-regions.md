# ADR 0043: Terminal Scroll Regions

Date: 2026-06-26

## Status

Accepted

## Context

Full-screen terminal programs and tmux use scroll margins to update panes,
status areas, and command regions without scrolling the whole terminal. Hovvi's
initial renderer scrolled the full screen on line feed, which could corrupt fixed
header/footer regions on mobile.

## Decision

Teach `TerminalScreen` to parse `CSI r` scroll-region changes and apply line
feed scrolling only inside the active region. `CSI top;bottom r` stores
one-based DEC-style margins as zero-based row bounds, resets the cursor to home,
and `CSI r` clears back to full-screen scrolling.

Scroll regions are preserved across alternate-screen snapshots and bounded when
the terminal is resized. Invalid or collapsed regions fall back to full-screen
scrolling rather than trapping.

## Consequences

The live terminal model is closer to tmux and full-screen tool behavior.
Reverse scrolling was added in ADR 0044, origin mode was added in ADR 0045, and
insert/delete line within margins was added in ADR 0047. Exact xterm edge cases
remain pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- ADR 0035: Terminal Screen Model.
