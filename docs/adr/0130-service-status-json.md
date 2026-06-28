# ADR 0130: Service Status JSON Diagnostics

## Status

Accepted.

## Context

`hovvi service` help advertised `--json`, and `hovvi service logs --json`
already supported machine-readable output. `hovvi service status` still emitted
only text, even though launchd lifecycle diagnostics are needed by setup
automation, tests, and future mobile onboarding.

Raw `launchctl print` output can contain noisy or environment-dependent text.
The status JSON shape should expose stable fields and avoid carrying raw detail
text that could accidentally include credentials.

## Decision

Add `hovvi service status --json`.

The JSON payload includes:

- `label`
- `loaded`
- `plistPath`
- `configPath`
- parsed `launchctl` lifecycle fields:
  - `state`
  - `pid`
  - `lastExitCode`
  - `lastTerminationReason`
  - `throttleInterval`
  - `healthy`

The JSON payload intentionally excludes raw `launchctl` detail text. Human text
status remains unchanged.

## Validation

- Unit coverage verifies the JSON shape and confirms raw detail text is not
  included.
- Existing service formatter and launchctl parser tests remain in place.

## Consequences

Automation can consume service state without parsing human text output. Future
doctor, setup, and mobile onboarding checks can depend on a stable structured
contract while preserving token-redaction boundaries.
