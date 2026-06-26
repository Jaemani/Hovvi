# ADR 0025: Agent Started Mosh Relay Attach Smoke

## Status

Accepted

## Context

ADR 0023 proved relay + agent + client datagram routing with a UDP echo target.
ADR 0024 added the Swift mobile attach coordinator with a fake mosh core.

The remaining relay integration gap before native mosh-core consumption is
whether a real agent-started attach manifest can bootstrap `mosh-server` and
whether the client can open the manifest's relay datagram transport through the
actual relay and agent path.

## Decision

Add an integration smoke that:

- starts a local Hovvi relay
- connects a real Hovvi agent connection
- asks the agent to prepare an attach manifest with `create: true`
- lets the agent create a temporary tmux session and start `mosh-server`
- validates the returned `relay-datagram` transport
- opens a real client datagram channel to the manifest UDP port through the
  relay and agent
- closes the channel and verifies relay datagram state is released

The test is skipped when `tmux` or `mosh-server` is unavailable.

## Rationale

This covers the server bootstrap and relay channel opening path without
pretending that native mosh packet exchange is complete. It narrows the next
native task to mosh-core packet consumption over an already validated manifest
and datagram channel path.

## Consequences

- `npm test -- test/integration-attach-relay.test.js` covers real
  agent-started mosh attach manifest bootstrap.
- Full terminal attach still requires native mosh packet exchange through the
  opened channel.
- No GPL upstream mosh source is added to npm artifacts.
