# Hovvi Roadmap

## Now

- launchd service command hardening.
- relay auth registry and device listing.
- local relay smoke tests for agent registration and forwarding.
- attach manifest contract for mobile clients.
- relay heartbeat and stale-device pruning.
- protocol validation and relay lifecycle integration tests.
- native iOS relay protocol core with request/response matching.
- native iOS forward stream models for attach transport.
- scoped relay credentials with token-redacted auth audit logs.
- registry-backed token listing and revocation CLI.
- relay-routed datagram channel primitive for mosh-compatible transport.
- Mac agent UDP adapter for relay datagram channels.
- mosh-server bootstrap in attach manifests.
- native iOS mosh relay-datagram packet session.
- mosh server key validation across Node and Swift attach paths.
- upstream mosh core integration boundary and audit tooling.
- reproducible upstream mosh vendoring plan script.

## Next

- Hosted relay account service with GitHub OAuth device registration.
- hosted credential lifecycle UI/API and audit log retention policy.
- vendored upstream mosh core adapter behind `hovvi_mosh_core.h`.
- iOS alpha shell: GitHub login, device/session list UI, attach transport, and tmux-native scrollback rendering.

## Later

- Android app after iOS attach quality stabilizes.
- WireGuard/P2P fast path with relay fallback.
- Homebrew tap and signed release artifacts.
