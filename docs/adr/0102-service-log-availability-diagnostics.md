# ADR 0102: Service Log Availability Diagnostics

## Status

Accepted

## Context

The Mac agent hardening roadmap requires LaunchAgent logs to be useful for
debugging common setup failures without leaking relay credentials or mosh keys.
`hovvi service logs` already redacted known secret forms, but when a LaunchAgent
had not yet produced a log file the command printed nothing.

Silent log output made it hard to distinguish:

- service never started;
- launchd has not created the log file yet;
- the log file exists but is empty;
- the user asked for stdout when the failure is in stderr.

## Decision

`hovvi service logs` now reads log metadata instead of only returning text.

Plain output:

- reports missing log files with their paths;
- reports existing empty log files with their paths;
- supports `--stream both` to inspect stdout and stderr together;
- preserves the existing redaction path for actual log text.

`hovvi service logs --json` returns the same metadata and redacted text for
automation.

## Consequences

- New users get an actionable signal when LaunchAgent logs are absent or empty.
- Support output remains paste-safe because log text still runs through
  redaction before printing.
- Scripts can use `--json` instead of parsing human-oriented headers.

## Verification

- `node --test test/service.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
