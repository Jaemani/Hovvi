# ADR 0070: Agent Reconnect Log Redaction

## Status

Accepted

## Context

The Mac agent runs under launchd in normal local and hosted setups. When the
relay connection drops, `runAgent` writes a reconnect diagnostic to stderr, which
launchd persists before `hovvi service logs` can apply its read-time redaction.

Service log redaction already removes relay tokens, URL credentials, bearer
tokens, and printable mosh keys when logs are displayed. That is not sufficient
for mature Mac package hardening because the raw LaunchAgent log file should not
receive avoidable secrets in the first place.

## Decision

Agent reconnect diagnostics are formatted through the shared `redactSecrets`
helper before being written to stderr.

The shared redaction helper also recognizes `MOSH_KEY=<printable-key>` and
`MOSH_KEY:<printable-key>` forms in addition to `MOSH CONNECT <port> <key>`.

## Consequences

- LaunchAgent stderr logs avoid storing common relay and mosh secret forms from
  reconnect errors.
- `hovvi service logs` remains a second redaction layer for older logs and
  unexpected log sources.
- The change does not alter relay authentication, token validation, attach
  manifest semantics, or mosh key validation.

## Validation

- `node --test test/agent.test.js test/service.test.js`
- Broader JavaScript and package gates should continue to run before commit.
