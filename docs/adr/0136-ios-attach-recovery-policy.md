# ADR 0136: iOS Attach Recovery Policy

## Status

Accepted

## Context

Recoverable iOS attach errors can require different next actions. Relay/device
errors should reconnect to the relay, while interrupted terminal sessions should
reattach the selected tmux session. The retry label and controller routing were
previously encoded separately, which allowed UI copy and behavior to drift.

## Decision

`HovviMobileCore` now owns `AttachShellRecoveryPolicy`. The policy maps
`AttachShellRecoveryAction` values to the user-facing retry label and to the
controller retry route.

The SwiftUI sidebar and app controller both consume the same policy, and
`HovviMobileCoreSmoke` verifies the mapping.

## Consequences

- Recovery UI labels and retry behavior remain coupled to one tested contract.
- Adding a new recovery action now requires updating one policy and its smoke
  coverage.
- This does not add hosted login or new recovery actions; it hardens the current
  relay reconnect vs session reattach contract.
