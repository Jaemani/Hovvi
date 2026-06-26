# ADR 0019: Local Mosh-Server Harness

## Status

Accepted

## Context

The roadmap requires a macOS harness that proves Hovvi's native mosh path against
a real local `mosh-server` before mobile UI integration. The repository already
has two separate pieces:

- `startMoshServer`, which bootstraps `mosh-server` and parses the `MOSH CONNECT`
  line.
- `createUdpDatagramBridge`, which forwards relay datagram payloads to a local
  UDP endpoint.

The upstream-backed C ABI slice can encrypt/decrypt packet-shaped terminal
state messages, but it is not yet the full socket-free upstream
`Network::Transport` loop. Claiming full native frame attach to `mosh-server`
would therefore be inaccurate at this step.

## Decision

Add `src/mosh-harness.js` and the `hovvi mosh-harness` CLI command.

The harness:

- checks for `tmux` and `mosh-server`
- creates or validates a tmux session
- starts a real local `mosh-server`
- validates the returned UDP port and printable 22-character mosh key
- opens a UDP relay-datagram bridge to the server
- cleans up the spawned `mosh-server` and harness-created tmux session

`createUdpDatagramBridge` now enforces `maxDatagramBytes` before socket writes,
and the Mac agent passes the manifest-provided datagram limit into the bridge.

## Rationale

This is the first executable macOS harness slice for milestone 3. It proves the
real server bootstrap and local relay/datagram boundary without weakening the
architecture or pretending the native ABI already implements the full mosh
transport loop.

## Consequences

- `npm test` includes a real local `mosh-server` smoke when `tmux` and
  `mosh-server` are installed, and skips it otherwise.
- The harness remains MIT-package-safe because it uses installed binaries and
  Hovvi-owned JS code; it does not package GPL mosh source or binaries.
- Full acceptance for the macOS harness milestone still requires native frame
  exchange with `mosh-server` after the upstream transport loop is connected to
  relay datagrams.
