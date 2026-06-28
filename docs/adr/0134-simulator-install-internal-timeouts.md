# ADR 0134: Simulator Install Internal Timeouts

## Status

Accepted

## Context

CI already wraps simulator gates in job-step timeouts, but the install gate could
spend the whole step budget inside its boot polling loop before returning a
structured failure. That made hosted-runner CoreSimulator stalls visible only as
a GitHub Actions timeout, with no useful `simctl` diagnostic from Hovvi.

## Decision

`iosSimulatorInstallCheck` now bounds each `simctl` operation with tighter
internal defaults:

- `simctl boot`: 45 seconds
- `simctl list devices --json`: 10 seconds
- boot polling: 18 polls at 2 seconds each
- `simctl shutdown`: 15 seconds
- `simctl install`: 60 seconds

The gate still retries one stalled boot by shutdown/reboot, but the script is
expected to fail and report from inside Hovvi before the CI step timeout kills
the process. Empty timeout failures are converted into explicit timeout
diagnostics.

## Consequences

- CI timeouts remain a last-resort guardrail instead of the primary verifier.
- Hosted-runner simulator stalls should produce actionable Hovvi output.
- Very slow simulator hosts may fail faster; this is acceptable for CI because
  simulator execution is a quality gate and should not hang silently.
