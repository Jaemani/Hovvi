# ADR 0135: Simulator Launch and Screenshot Internal Timeouts

## Status

Accepted

## Context

The simulator screenshot matrix is a CI quality gate. GitHub Actions step
timeouts stop whole-step hangs, but they do not tell whether the stalled
operation was app launch, screenshot capture, or cleanup. The screenshot matrix
also captures several fixtures, so one hung `simctl` command must fail inside
Hovvi before the enclosing step loses diagnostic context.

## Decision

Simulator launch and screenshot capture now use bounded internal defaults:

- `simctl launch`: 60 seconds
- `simctl io screenshot`: 60 seconds
- `simctl terminate`: 15 seconds

Launch and screenshot failures use a shared `simctl` diagnostic formatter so
empty `ETIMEDOUT` failures are reported as explicit timeout messages.

## Consequences

- The screenshot matrix can fail with operation-level diagnostics instead of
  only a CI step timeout.
- Simulator cleanup remains best-effort and bounded.
- Very slow simulator hosts may fail faster, which is acceptable for CI because
  simulator evidence should be timely and auditable.
