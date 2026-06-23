# ADR 0003: tmux Native Scrollback

## Status

Accepted

## Decision

Hovvi separates live terminal streaming from scrollback. Live terminal transport follows mosh compatibility, while mobile-native scrolling is backed by tmux capture/control data.

## Rationale

Mobile scroll should feel like a native text surface, not like dragging a terminal viewport. tmux already owns pane history, windows, and sessions, so Hovvi should read scrollback from tmux instead of trying to reconstruct history from terminal frames.

## Consequences

- `hovvi capture` is the first CLI proof of this behavior.
- The mobile app should keep a local text buffer for inspection and search.
- The live stream and scrollback stream must converge on the same pane identity.
