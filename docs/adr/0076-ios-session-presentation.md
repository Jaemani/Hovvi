# ADR 0076: iOS Session Presentation

## Status

Accepted

## Context

The iOS alpha shell must distinguish attachable tmux/cmux sessions and detected
AI coding sessions. The first SwiftUI session row displayed a single ad hoc
subtitle string and only a generic sparkle indicator for AI panes. That made the
UI behavior harder to test and easy to drift from the relay session metadata.

## Decision

Add a public `SessionPresentation` projection in `HovviMobileUI`.

The projection maps `Session` metadata to:

- a stable SF Symbol name for tmux, cmux, and AI development sessions
- ordered status badges for session kind, window count, attached state, and
  unique detected AI commands
- a compact subtitle fallback for narrow layouts and smoke tests

`SessionRow` now renders from this projection instead of building row strings
inline.

## Consequences

- Session-list UI has a testable contract for tmux, cmux, and AI coding
  sessions.
- Preview fixtures cover attached AI sessions, cmux sessions with AI panes, and
  plain tmux sessions.
- Mobile clients still attach through the same mosh/tmux manifest path; this is
  presentation hardening only.
- Future richer agent controls can reuse the projection without changing relay
  protocol fields.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
