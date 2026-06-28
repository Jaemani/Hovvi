# ADR 0141: Close iOS Relay Datagram on Attach Start Failure

## Status

Accepted

## Context

The iOS attach model creates a relay datagram channel before the mosh core start
frame is fully flushed. If the native mosh engine fails after the datagram is
opened, the model should not leave that relay channel alive while surfacing a
recoverable attach error.

This case is different from manifest validation or scrollback failure, where no
datagram channel has been opened yet.

## Decision

`AttachShellModel.attach` now closes the current attach transport best-effort
from the attach failure path before clearing the active session.

## Consequences

- Engine start or initial packet flush failures do not leak relay datagram
  channels.
- The user-facing attach failure remains recoverable through the existing
  reattach action.
- A smoke test verifies that a datagram opened before a failing engine start is
  closed and no stale input can use the failed attach session.
