# ADR 0063: cmux Session Discovery

## Status

Accepted

## Context

The product target includes tmux, cmux, Claude Code, and Codex session
continuation. The current relay-backed attach path is proven for tmux through
mosh-server and tmux-native scrollback. cmux support should become visible to
mobile clients without weakening the already validated tmux attach path or
pretending that cmux has a separate proven attach transport.

Hovvi already detects AI panes from tmux pane commands. cmux can be exposed first
as session metadata when it is running inside a tmux pane, while the actual
attach target remains the containing tmux session.

## Decision

Add cmux session discovery metadata to the Mac agent session list.

`parseTmuxPaneLine` now marks panes whose current command is `cmux`.
`listSessions` exposes `cmuxPanes` and classifies the containing session as
`kind: "cmux"` when any cmux pane is present. cmux classification takes
precedence over generic AI pane classification so mobile session lists can show
the more specific workflow.

The Mac agent advertises `cmux.sessions` only when the `cmux` command is
available. This is an optional capability. It does not change mosh-server
bootstrap, tmux attach commands, scrollback capture, or relay datagram behavior.

## Consequences

- Mobile clients can distinguish cmux sessions before a dedicated cmux attach
  path exists.
- tmux remains the source of truth for attach, panes, and scrollback.
- Missing cmux does not affect existing tmux or AI coding session discovery.
- A future cmux-native attach path would need its own ADR and tests before
  replacing the tmux-backed path.

## Validation

- `npm test`
- `npm run check`
