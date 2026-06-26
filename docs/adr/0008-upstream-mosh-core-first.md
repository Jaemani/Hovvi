# ADR 0008: Upstream Mosh Core First

## Status

Accepted

## Context

Hovvi needs mobile mosh compatibility over relay datagrams. Mosh is not a simple UDP byte stream; its user-visible behavior depends on AES-OCB packet authentication, nonce handling, replay rejection, State Synchronization Protocol behavior, terminal state diffing, prediction, and resize/input semantics.

The current Hovvi relay path already bootstraps `mosh-server` on the Mac agent, exposes the printable mosh server key in the attach manifest, and carries opaque encrypted mosh datagrams over the relay.

## Decision

Use an upstream-mosh-first native core plan.

Hovvi will wrap upstream mosh internals behind a small C ABI instead of reimplementing the mosh protocol directly in Swift. The C ABI lives in `native/mosh-core/include/hovvi_mosh_core.h`. Swift consumes that through the `MoshCoreEngine` interface.

The first wrapper target is a packet-oriented client core:

- keep upstream crypto, SSP, terminal parser, framebuffer, and prediction behavior intact
- replace direct UDP socket send/recv with Hovvi relay datagram input/output
- keep `mosh-client` CLI, terminal driver, and process-level signal loop outside the mobile app boundary

## Rationale

Protocol correctness is more important than implementation ownership here. Reusing upstream behavior reduces the chance of subtle compatibility failures around packet loss, retransmission, terminal diffing, Unicode, resize, and predictive echo.

The selected boundary keeps app code independent from upstream C++ class layout. It also gives us one place to handle license notices, source availability, generated protobufs, OpenSSL/OCB choices, and iOS build flags.

## Rejected Alternatives

- Reimplement mosh crypto/SSP in Swift first.
  - Rejected because it increases security and compatibility risk before the product proves the attach path.
- Treat mosh as plain UDP forwarding only.
  - Rejected because mobile UI still needs a terminal state engine and predictive behavior.
- Link the whole `mosh-client` executable into the app.
  - Rejected because its CLI, termios, select loop, Unix signals, and UDP sockets are not the right mobile app boundary.

## Consequences

- Vendoring upstream mosh-derived source may make the mobile app a GPL-covered combined work. Distribution must include license text and corresponding source.
- The App Store waiver in upstream `COPYING.iOS` reduces one Apple terms conflict but does not remove GPL obligations.
- The wrapper must be tested against a real `mosh-server`, packet loss/reordering, resize, paste, and clean shutdown.
- `scripts/mosh-upstream-audit.js` records the upstream source and license signals before vendoring or updating the pinned mosh commit.
