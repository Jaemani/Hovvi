# Technical References

Hovvi should lean on proven terminal and packaging behavior instead of inventing protocols casually.

## Terminal and Session Model

- Mosh: roaming, intermittent connectivity, and responsive interactive terminal behavior are the compatibility target.
  - https://mosh.org/
  - https://github.com/mobile-shell/mosh
- tmux control mode: native mobile UI and scrollback should use tmux as the source of truth for panes, windows, sessions, and history.
  - https://github.com/tmux/tmux/wiki/Control-Mode

## macOS Service Management

- LaunchAgents are the correct first target for a per-user Mac agent.
  - https://support.apple.com/guide/terminal/script-management-with-launchd-apdc6c1077b-5d5d-4d35-9c19-60f2397b2369/mac

## Release and Supply Chain

- npm Trusted Publishing should replace long-lived automation tokens once release automation is enabled.
  - https://docs.npmjs.com/trusted-publishers/
  - https://docs.npmjs.com/generating-provenance-statements/
