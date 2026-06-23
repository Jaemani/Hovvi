# Hovvi iOS Alpha

The iOS app is intentionally not scaffolded as a throwaway UI yet.

The first native build should consume the relay protocol implemented by the CLI package:

- GitHub OAuth login
- device list from `devices.snapshot`
- session cards from agent `sessions.update`
- encrypted attach transport
- native tmux scrollback view backed by `tmux capture-pane`/control mode

Reference UX:

1. Open app.
2. Sign in with GitHub.
3. Pick a Mac.
4. Pick a tmux/Claude/Codex session.
5. Attach with mosh-compatible live terminal behavior and native scrollback.
