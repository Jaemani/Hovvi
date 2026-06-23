# ADR 0002: Mosh Compatibility Target

## Status

Accepted

## Decision

Hovvi treats mosh behavior as the compatibility target instead of inventing a new terminal protocol.

## Rationale

Mosh already solves the user-visible problems Hovvi cares about: roaming, intermittent networks, local echo, and responsive mobile terminal input. Reusing those semantics keeps Hovvi focused on onboarding, relay, session discovery, and mobile UX.

## Consequences

- The MVP may use SSH forwarding to prove relay transport, but production terminal attach should preserve mosh-compatible datagram behavior.
- mosh-server remains a required host dependency.
- Any mosh code reuse needs explicit license review before vendoring or static linking.
