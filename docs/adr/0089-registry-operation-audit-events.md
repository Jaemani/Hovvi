# ADR 0089: Registry Operation Audit Events

## Status

Accepted

## Context

Hosted relay work needs audit evidence for account, device, and token lifecycle
operations. Relay authentication already records redacted auth events, but
registry management commands did not emit operation audit records. That made
local hosted-relay rehearsals harder to trace.

Token hashes are bearer-equivalent enough for operational logs to avoid them.
The audit sanitizer removed token-shaped fields, but not hash-shaped fields.

## Decision

Registry management commands now accept `--audit-log <path>` and also respect
`HOVVI_AUDIT_LOG`. When provided, they write JSONL operation events for:

- token generation
- token hashing
- token revocation
- account upsert
- device upsert
- device revocation

Audit records include non-secret metadata such as account id, device id, token
name, role scopes, device/client constraints, and validity windows. They do not
include raw relay tokens or token hashes. The audit sanitizer now drops keys
containing `token` or `hash`.

## Consequences

- Hosted-relay rehearsals can produce a durable audit trail for registry
  mutations without exposing credential material.
- Token hashes are protected even if a future caller accidentally passes a
  hash-shaped field into the audit sink.
- List/read-only commands still do not produce audit records.

## Validation

- `node --test test/audit.test.js test/cli-token.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
