# ADR 0060: iOS Attach Shell Fixtures

## Status

Accepted

## Context

The iOS alpha attach shell now has a public terminal surface projection and a
bounded viewport, but simulator and device rendering validation still need a
stable UI state. Network-backed relay state is not suitable as the first
screenshot baseline because device lists, session detection, scrollback, and
live terminal output can change between runs.

The render validation path needs a deterministic attached state that includes
the product-specific surfaces Hovvi cares about: a selected Mac, tmux sessions,
detected Claude Code and Codex panes, tmux-native scrollback, live mosh terminal
rows, an attach manifest, and a recoverable attach failure.

## Decision

Add `AttachShellPreviewFixtures` to `HovviMobileUI`.

The fixture exposes:

- `browsing` for the signed-in device/session browser state.
- `attachedCodingAgent` for a live tmux session with detected AI panes,
  scrollback rows, live terminal output, and a relay-datagram mosh manifest.
- `failedAttach` for recoverable reattach UI.
- `terminalViewport(maxRows:)` for deterministic viewport validation.

These fixtures are pure Swift data and do not start a relay, open a datagram
channel, or link the upstream GPL mosh static library. `HovviMobileCoreSmoke`
validates the fixture shape, row sources, viewport cap, bottom anchor, and
reattach recovery action.

## Consequences

- Simulator and device screenshot tests can render the same baseline without
  depending on local relay availability.
- SwiftUI previews and future Xcode bundle targets can share the same state as
  CI smoke tests.
- The fixture is not a substitute for real relay-backed attach validation; it
  only stabilizes visual/rendering assertions.
- Product-specific session indicators for Claude Code and Codex are represented
  before hosted login work begins.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
