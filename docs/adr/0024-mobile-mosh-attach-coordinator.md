# ADR 0024: Mobile Mosh Attach Coordinator

## Status

Accepted

## Context

ADR 0023 added a real relay + agent + client datagram smoke. The mobile core
already had separate abstractions for:

- relay datagram channels
- mosh server key and attach manifest validation
- a pluggable mosh core engine

The next gap was the coordinator that turns mosh core frames into relay
datagram sends and turns inbound relay datagrams back into mosh core receives.

Directly linking upstream mosh into the first mobile coordinator slice would
cross the GPL mobile distribution decision gate too early.

## Decision

Add `MoshAttachSession` to the Swift mobile core. It composes:

- `MoshRelayDatagramSession`
- `MoshCoreEngine`

The coordinator:

- opens the relay datagram channel
- starts the mosh core with the manifest server key and terminal size
- flushes outbound core packets through relay datagrams
- receives relay datagrams and passes them into the core
- surfaces terminal output, next tick scheduling, packet counts, and clean
  shutdown state to the future UI layer
- closes the relay datagram session on shutdown

The smoke test uses a fake relay and fake mosh core engine to verify ordering,
relay sequence assignment, terminal output propagation, tick propagation,
resize propagation, and shutdown cleanup.

## Rationale

This locks the mobile product boundary before the upstream native engine is
linked. The UI layer can depend on a stable attach-session contract while the
GPL-linked core remains behind a later explicit distribution decision.

## Consequences

- `swift run HovviMobileCoreSmoke` now covers the mobile attach coordinator
  lifecycle without requiring a linked upstream mosh binary.
- The coordinator is ready for a native mosh engine implementation once the
  platform build and license/compliance gates are satisfied.
- This does not change npm packaging and does not include GPL upstream mosh
  source in the npm artifact.
