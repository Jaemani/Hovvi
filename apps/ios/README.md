# Hovvi iOS Alpha

The iOS app is intentionally not scaffolded as a throwaway UI yet. Hovvi is native-first for mobile because terminal attach, keyboard behavior, background lifecycle, mosh-compatible transport, and future Network Extension work are platform-sensitive.

`HovviMobileCore` is a Swift Package that pins the first native protocol models and JSON coding behavior. Run:

```bash
swift build
swift run HovviMobileCoreSmoke
```

The package currently covers flattened relay envelopes, outgoing client message builders, and incoming message dispatch. It does not yet open WebSocket connections or render a terminal.

The first native build should consume the relay protocol implemented by the CLI package:

- GitHub OAuth login
- device list from `devices.snapshot`
- session cards from agent `sessions.update`
- encrypted attach transport
- native tmux scrollback view backed by `tmux capture-pane`/control mode

Flutter is acceptable for non-terminal app surfaces later, but the iOS alpha should keep the attach path native.

Reference UX:

1. Open app.
2. Sign in with GitHub.
3. Pick a Mac.
4. Pick a tmux/Claude/Codex session.
5. Attach with mosh-compatible live terminal behavior and native scrollback.
