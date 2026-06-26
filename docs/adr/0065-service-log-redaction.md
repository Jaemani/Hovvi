# ADR 0065: Redact Service Log Secrets at the CLI Boundary

Date: 2026-06-27

## Status

Accepted

## Context

The roadmap requires Mac agent logs and diagnostics to be useful for setup
debugging without leaking relay tokens, hosted credentials, or mosh session
keys. The LaunchAgent writes stdout and stderr to files under
`~/.hovvi/logs/`, and `hovvi service logs` is the first user-facing surface that
prints those files.

## Decision

`hovvi service logs` redacts log text before printing it. The redaction boundary
lives in `src/redaction.js` and covers:

- WebSocket URL credentials.
- `HOVVI_RELAY_TOKEN` assignments.
- common `token` and `access_token` field forms.
- `Authorization: Bearer ...` headers.
- printable keys from `MOSH CONNECT <port> <key>` lines.

`hovvi doctor --network` now uses the same URL credential redaction helper for
relay reachability output.

## Consequences

- Service logs remain useful for diagnosing LaunchAgent and relay connection
  failures while avoiding accidental token or mosh key disclosure.
- The CLI does not expose a raw-log bypass. Raw local log files remain on disk
  for the owner of the Mac, but the user-facing command prints redacted output.
- Redaction is best-effort and pattern based. Future hosted auth work should
  add credential-specific patterns as token shapes are finalized.

## Validation

- `npm run check`
- `node --test test/service.test.js test/doctor.test.js`
