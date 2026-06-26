# ADR 0055: Live Terminal and Scrollback Separation

## Status

Accepted

## Context

The iOS alpha shell needs smooth mobile scrolling without treating the live mosh
screen as complete terminal history. Hovvi already fetches tmux-native scrollback
before attach, and `TerminalScreen` models the live terminal state after attach.
Appending live mosh terminal bytes into `ScrollbackBuffer` mixes two different
streams and can store escape-control output as if it were tmux history.

## Decision

`AttachShellModel` keeps `ScrollbackBuffer` as the tmux-native snapshot fetched
through `session.scrollback.fetch`. Live mosh terminal bytes are applied only to
`TerminalScreen` and exposed as `terminalOutput`.

`TerminalSurfaceView` composes the display from both sources:

- scrollback rows use `scrollback-` prefixed stable IDs;
- live screen rows use `live-` prefixed stable IDs;
- if no live screen text exists yet, the surface falls back to scrollback only.

This keeps the model boundary explicit while still letting the mobile view show
history above the current live screen.

## Consequences

- tmux-native scrollback remains reproducible from the agent instead of being
  inferred from terminal escape streams.
- Live terminal control sequences cannot corrupt stored scrollback rows.
- Auto-scroll uses a single rendered sequence with collision-free IDs.
- Future scroll anchoring, search, and selection can distinguish history rows
  from live screen rows.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
