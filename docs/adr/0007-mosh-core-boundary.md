# ADR 0007: Mosh Core Boundary

## Status

Accepted

## Decision

Hovvi keeps relay datagram transport separate from the mosh crypto and state engine.

The relay, Mac agent UDP adapter, and mobile relay datagram session treat mosh packets as opaque datagrams. They may validate outer transport metadata such as UDP port, datagram size, and mosh server key shape, but they must not parse, decrypt, coalesce, or reorder mosh's encrypted payload.

The mobile terminal engine must either vendor/link a reviewed mosh-compatible core or implement the AES-OCB and SSP layer against the upstream mosh protocol behavior. That work is a separate boundary from the Hovvi relay protocol.

## Rationale

Mosh compatibility depends on exact packet semantics: a 22-character printable AES key from `mosh-server`, UDP datagrams carrying nonce-authenticated AES-OCB packets, and the State Synchronization Protocol above that encrypted packet layer.

Keeping Hovvi relay datagrams opaque avoids accidentally creating a partial mosh fork in relay code. It also lets us test transport reliability independently before choosing whether the mobile app links upstream mosh-derived code or a separately implemented compatible core.

## Consequences

- The attach manifest exposes the mosh server key, UDP port, and datagram size target as transport metadata.
- Swift and Node validate mosh server keys as 22 base64 characters without padding.
- Relay-level `sequence` values are diagnostics only; mosh packet ordering and integrity remain inside the mosh engine.
- Before vendoring or static linking upstream mosh code, licenses and iOS linking constraints need explicit review.
