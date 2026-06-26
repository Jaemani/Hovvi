# ADR 0021: Loopback Mosh-Server Probe

## Status

Accepted

## Context

The Hovvi agent does not expose `mosh-server` directly to the network. It starts
`mosh-server` locally and forwards encrypted mosh datagrams through the Hovvi
relay datagram bridge.

The earlier bootstrap command used `mosh-server new -s`, which asks mosh-server
to infer an SSH-local bind address. In a local agent context there may be no
`SSH_CONNECTION`, and the resulting bind choice can be unsuitable for a
`127.0.0.1` UDP bridge.

## Decision

Bind Hovvi-started `mosh-server` instances explicitly to `127.0.0.1`:

```bash
mosh-server new -i 127.0.0.1 ...
```

Add an optional local native probe:

```bash
npm run native:mosh-server-harness-check
```

The script skips when `tmux` or `mosh-server` is unavailable. When dependencies
exist, it creates a temporary tmux session, starts a real local `mosh-server`,
builds the upstream native probe binary, sends a relay-backed mosh resize
instruction to the UDP port, and verifies native frame output contains the tmux
marker.

## Rationale

Loopback binding matches Hovvi's relay-first threat model:

- no inbound UDP port is exposed beyond the Mac
- the agent-side UDP bridge has a deterministic local target
- the native probe can validate real `mosh-server` exchange without VPN, port
  forwarding, or SSH host configuration

## Consequences

- Attach manifests now describe a loopback-bound mosh server command.
- `native:mosh-server-harness-check` proves the first real local
  `mosh-server` exchange through upstream native transport code on machines
  with `tmux` and `mosh-server`.
- This remains an optional local check rather than a CI gate because CI runners
  do not guarantee `mosh-server` availability.
