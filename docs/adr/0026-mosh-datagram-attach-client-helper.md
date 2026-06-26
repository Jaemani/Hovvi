# ADR 0026: Mosh Datagram Attach Client Helper

## Status

Accepted

## Context

ADR 0025 proved that a client can prepare an agent-started mosh attach manifest
and open the returned relay datagram transport. The test still parsed the
manifest manually, which would encourage each CLI or mobile caller to duplicate
selection and validation logic.

## Decision

Add `createClient().prepareMoshDatagramAttach(...)`.

The helper:

- calls `session.attach.prepare`
- selects the highest-priority available `mosh` method with
  `relay-datagram` transport
- validates `remotePort`
- validates the printable 22-character mosh server key
- opens the datagram channel using the selected transport
- returns `{ manifest, method, transport, channel }`

## Rationale

Attach manifest interpretation is part of the Hovvi client contract, not
application UI glue. Keeping selection and validation in the relay client makes
future CLI, iOS, and test callers less likely to diverge.

## Consequences

- The agent-started relay attach smoke now uses the same public helper expected
  by future attach surfaces.
- The helper still does not perform native mosh packet exchange; that remains
  behind the native engine integration milestone.
- No GPL upstream mosh source is added to npm artifacts.
