# ADR 0140: Cancel iOS Tick Loop After Receive-Driven Detach

## Status

Accepted

## Context

The iOS attach controller runs a receive loop and a mosh tick loop while a
session is attached. Previous lifecycle guards prevented stale loop generations
from publishing snapshots after reconnect, retry, reattach, selection change, or
background pause. However, a receive-loop snapshot can also move the shell out
of `.attached`, such as after a clean shutdown or recoverable terminal failure.

If the tick task is sleeping when that receive-loop snapshot is applied, it does
not need to remain scheduled until the sleep wakes up and rechecks model state.

## Decision

`AttachShellLifecyclePolicy` now defines that non-attached snapshots cancel the
tick loop after they are applied. `HovviAppController` applies this policy from
the receive loop immediately after publishing the snapshot.

The existing generation guard remains the authority for stale loop snapshots.
This change only tightens active-loop cleanup after the current receive loop
legitimately transitions the shell out of `.attached`.

## Consequences

- Receive-driven clean shutdowns and terminal failures cancel sleeping tick
  tasks immediately.
- Attached snapshots still keep or start ticking as before.
- The policy is covered in `HovviMobileCoreSmoke`, keeping UI controller
  lifecycle behavior tied to a tested core invariant.
