# ADR 0037: Terminal Alternate Screen

Date: 2026-06-26

## Status

Accepted

## Context

Full-screen terminal programs such as tmux, vim, less, Claude Code, and Codex
commonly use private CSI alternate-screen modes. Without alternate-screen
handling, mobile rendering can overwrite the primary screen and make returning
from a full-screen program look like lost scrollback or corrupted terminal
state.

## Decision

Teach `TerminalScreen` to recognize DEC private alternate-screen mode toggles
for `?47`, `?1047`, and `?1049`.

On entry, Hovvi snapshots the primary cells, cursor, and current text attributes,
then presents a blank live alternate screen. On exit, Hovvi restores the primary
snapshot, bounded to the current terminal size if a resize happened while the
alternate screen was active.

This keeps the renderer native-first and avoids pulling in a full terminal
emulator before the attach shell has enough real-device validation.

## Consequences

The iOS attach shell can now preserve the primary terminal surface while
full-screen programs draw into an alternate surface. This is still a pragmatic
subset: scroll regions, save/restore cursor variants, bracketed paste, mouse
tracking, and exact xterm alternate-screen edge cases remain pending.

## Validation

- `swift build --package-path apps/ios`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalScreen.swift`
- ADR 0035: Terminal Screen Model.
- ADR 0036: Terminal SGR Attributes.
