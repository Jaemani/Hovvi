# ADR 0082: iOS Screenshot Fixture Mode

## Status

Accepted

## Context

The iOS alpha milestone requires simulator or device evidence for attach UI
quality. Screenshot automation should not depend on a live relay, Mac agent, or
mosh session for every visual regression run. It needs deterministic app state
that still exercises the real SwiftUI shell and terminal renderer.

`HovviMobileUI` already has preview fixtures for browsing, attached
coding-agent, and failed reattach states, but `HovviMobileApp` always attempted
to connect to the configured relay on launch.

## Decision

`AttachShellPreviewFixtures` now exposes a named fixture selector and the
environment key `HOVVI_IOS_SNAPSHOT_FIXTURE`.

`HovviMobileApp` reads that environment variable at startup. When it matches a
known fixture, the app starts in fixture mode, renders the selected
`AttachShellSnapshot`, and suppresses relay/attach/input actions. Unknown
fixture names are ignored so normal app behavior is unchanged.

Supported fixture names:

- `browsing`
- `attached-coding-agent`
- `failed-attach`

## Consequences

- Simulator screenshot automation can launch the real app UI without requiring
  live relay credentials or network state.
- Fixture mode cannot accidentally send relay credentials, input bytes, or
  attach requests.
- Future screenshot checks can focus on rendered geometry, scroll behavior, and
  state presentation instead of setup flakiness.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
