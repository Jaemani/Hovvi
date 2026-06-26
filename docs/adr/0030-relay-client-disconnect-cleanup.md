# ADR 0030: Relay Client Disconnect Cleanup

Date: 2026-06-26

## Status

Accepted

## Context

Hovvi's relay-first attach path depends on long-lived WebSocket clients that can
have pending device snapshots, attach manifests, scrollback reads, TCP forward
opens, and datagram channel opens. Mobile networks frequently suspend or replace
connections. If the relay or network closes first, these pending operations must
fail immediately instead of waiting for operation-specific timeouts.

Earlier relay lifecycle coverage proved server-side datagram cleanup for peer
disconnects and idle timeouts, but the JavaScript client API still needed a
single cleanup path for unexpected relay disconnects.

## Decision

Add a single relay-client failure path that runs for WebSocket `close`, WebSocket
`error`, and explicit client `close()`.

The failure path:

- rejects pending device snapshot waits;
- rejects pending attach and scrollback requests;
- rejects pending datagram opens and closes opened datagram channels;
- destroys pending and opened forward streams;
- makes later public API calls reject immediately with `relay client is closed`.

Explicit `client.close()` still sends best-effort datagram close frames when the
socket is open. Unexpected relay disconnects do not attempt network writes and
only clean local client state.

## Consequences

Mobile attach orchestration can treat relay disconnect as a deterministic
session failure and later layer reconnect behavior above this API without hidden
pending promises. This does not implement automatic reconnect yet; it makes the
lower-level client state safe enough for a reconnecting wrapper.

## Validation

- `node --check src/relay-client.js`
- `node --test test/integration-relay.test.js`
- `npm test`

## References

- `docs/roadmap.md` Relay Datagram Integration acceptance criteria.
- `docs/mosh-core-integration.md` relay datagram lifecycle notes.
- ADR 0022: Relay Datagram Lifecycle Fixtures.
- ADR 0023: Relay Agent Client Datagram Smoke.
- ADR 0027: Native Relay Attach Check.
