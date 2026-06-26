# ADR 0045: Terminal Origin Mode

## Status

Accepted

## Context

After scroll regions and reverse index were added, cursor addressing was still
absolute-only. Full-screen terminal applications can enable DEC origin mode
(`CSI ? 6 h`) so cursor positioning and vertical cursor movement are bounded by
the active scroll region. Without this, tmux-style panes can address rows outside
their active margins in Hovvi's live terminal model.

## Decision

`TerminalEscapeParser` now recognizes DEC private mode 6 set/reset through
`CSI ? 6 h` and `CSI ? 6 l`. `TerminalScreen` keeps an `originMode` flag and
applies it to:

- cursor home;
- `CUP`/`HVP` row addressing;
- vertical cursor up/down bounds;
- scroll-region setup/reset home behavior;
- alternate-screen snapshot/restore boundaries.

The implementation stays in the Swift live-screen model and does not affect
tmux-native scrollback or the relay/datagram protocol.

## Consequences

- Cursor addressing now matches the active margins when origin mode is enabled.
- Scroll regions, reverse index, and cursor movement have a consistent bounded
  model for common full-screen terminal output.
- Insert/delete line, tab stops, saved cursor state, and exact xterm private
  mode combinations remain pending.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

