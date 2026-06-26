# ADR 0027: Native Relay Attach Check

## Status

Accepted

## Context

ADR 0025 proved that a client can open a relay datagram channel from an
agent-started mosh attach manifest. The remaining gap in the relay integration
milestone was native mosh packet exchange through that relay path.

The existing native `upstream_mosh_server_probe` already proves native mosh
packet exchange against a directly connected local UDP `mosh-server`. It did not
prove the Hovvi relay, agent UDP bridge, and JavaScript client datagram channel
in the same path.

## Decision

Add `npm run native:relay-attach-check`.

The check:

- starts a local Hovvi relay
- connects a real Hovvi agent
- prepares a mosh attach manifest for a temporary tmux session
- opens the manifest's relay datagram channel with the JavaScript client helper
- binds a local UDP shim in front of that relay datagram channel
- runs the repository-only native `upstream_mosh_server_probe` against the shim

The native probe still sends real upstream mosh encrypted packets. The packets
flow through:

native probe -> local UDP shim -> JavaScript relay client datagram channel ->
Hovvi relay -> agent UDP bridge -> local `mosh-server`.

The script skips when `tmux`, `mosh-server`, or the vendored upstream mosh
snapshot is unavailable.

## Rationale

This proves native mosh packet exchange through the relay-first attach path
without adding GPL-linked upstream mosh code to the npm package artifact and
without modifying vendored upstream files.

## Consequences

- Local Macs with `tmux` and `mosh-server` can run the relay/native attach gate
  with `npm run native:relay-attach-check`.
- CI can continue using package dry-run and upstream native smokes without
  shipping GPL-linked artifacts.
- The remaining mobile milestone work moves to native C ABI linkage for iOS and
  terminal UI quality.
