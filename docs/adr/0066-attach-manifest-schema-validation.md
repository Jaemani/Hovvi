# ADR 0066: Validate Attach Manifest Kind and Version

Date: 2026-06-27

## Status

Accepted

## Context

Mobile attach depends on the agent-generated attach manifest. The manifest
already includes `kind: "mosh-tmux"` and `version: 1`, but clients previously
selected the mosh relay datagram method without first enforcing those schema
fields. That makes future manifest changes harder to reason about.

## Decision

The v1 attach manifest contract is explicit:

- `kind` must be `mosh-tmux`.
- `version` must be `1`.
- `methods` must be an array before method selection.

The JavaScript relay client validates this contract before selecting an
available `mosh` `relay-datagram` method. The Swift mobile core validates the
same fields before selecting the preferred mosh relay datagram transport or
creating a `MoshRelayDatagramSession`.

## Consequences

- Unknown future manifest kinds or versions fail closed instead of producing a
  partial attach.
- The schema can evolve later by adding explicit compatibility handling instead
  of relying on accidental structural overlap.
- This does not change the relay envelope version or the encrypted mosh
  datagram boundary.

## Validation

- `npm run check`
- `node --test test/attach.test.js`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`
