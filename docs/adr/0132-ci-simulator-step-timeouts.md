# ADR 0132: CI Simulator Step Timeouts

## Status

Accepted.

## Context

After replacing `simctl bootstatus -b` with bounded simulator state polling,
GitHub-hosted macOS CI still remained in `npm run ios:simulator-install-check`.
That means CoreSimulator or `xcrun` can still hang below the harness command
boundary, before JavaScript can return a structured failure.

The simulator evidence remains valuable, but CI must not allow a single
CoreSimulator operation to consume the job indefinitely.

## Decision

Add explicit GitHub Actions `timeout-minutes` values to each simulator step:

- preflight: 3 minutes
- build: 5 minutes
- app bundle: 5 minutes
- install: 4 minutes
- launch: 4 minutes
- screenshot matrix: 5 minutes

Also configure the shared synchronous shell runner to use `SIGKILL` for command
timeouts by default, so local harnesses prefer bounded failure over waiting for
child processes that ignore the default termination signal.

## Validation

- Unit coverage verifies `runText` returns an `ETIMEDOUT` error for an over-time
  child process.
- CI workflow timeouts are repository policy and are verified by GitHub Actions
  on push.

## Consequences

Simulator gates remain fail-closed, but hosted-runner CoreSimulator hangs now
produce bounded CI failures. Future work can narrow the failing simulator command
from available step evidence instead of debugging a job-level stall.
