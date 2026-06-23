# ADR 0001: Managed Relay First

## Status

Accepted

## Decision

Hovvi starts with a managed relay. The Mac agent keeps an outbound WebSocket connection to the relay, and mobile clients connect to the same relay after login.

## Rationale

The target UX is login-only access from mobile. Requiring users to configure IP addresses, ports, VPNs, or router rules would break that promise. A relay-first design also lets us ship a useful MVP before implementing WireGuard-style NAT traversal.

## Consequences

- Relay cost and availability matter from day one.
- The relay must not require inbound connections to the Mac.
- Terminal payloads must be encrypted above the relay layer or end-to-end before production use.
- P2P/WireGuard can be added later as an optimization, not as an MVP blocker.
