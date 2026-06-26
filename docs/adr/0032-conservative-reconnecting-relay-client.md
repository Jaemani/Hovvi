# ADR 0032: Conservative Reconnecting Relay Client

Date: 2026-06-26

## Status

Accepted

## Context

Mobile clients need to survive ordinary relay WebSocket churn. After ADR 0030,
the low-level relay client deterministically rejects pending operations and marks
later calls closed after a disconnect. The next layer needs to create a fresh
client for subsequent user actions.

Automatically retrying every operation is unsafe. `prepareAttach` may start a
`mosh-server` on the agent, and retrying an in-flight attach after a network cut
could create duplicate server processes or confusing manifests.

## Decision

Add `createReconnectingClient` in `src/reconnecting-relay-client.js`.

The wrapper:

- lazily creates an underlying relay client with bounded connect backoff;
- forwards the same public client operations;
- resets the underlying client when an operation reports `relay client is
  closed` or `relay client disconnected`;
- lets the failed operation fail instead of silently retrying it;
- reconnects on the next public operation.

This is intentionally conservative. Idempotent automatic retries and mobile UI
retry prompts should be added above this layer after attach lifecycle behavior is
observable in the app.

## Consequences

The wrapper gives iOS/mobile orchestration a stable reconnection boundary without
weakening attach safety. Users can retry from the UI after a disconnect, and the
next operation will use a fresh relay WebSocket.

The wrapper does not yet provide event callbacks, background reconnect loops, or
operation-specific retry policy. Those belong in the mobile session coordinator
after terminal UI integration exposes the right states.

## Validation

- `npm run check`
- `node --test test/reconnecting-relay-client.test.js`
- `git diff --check`

## References

- ADR 0030: Relay Client Disconnect Cleanup.
- ADR 0031: Local Relay Process Attach Check.
- `docs/roadmap.md` Relay Datagram Integration and iOS Alpha Attach Shell.
