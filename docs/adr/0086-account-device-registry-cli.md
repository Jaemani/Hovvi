# ADR 0086: Account and Device Registry CLI

## Status

Accepted

## Context

Hosted relay work needs account and device registration before the full GitHub
OAuth issuance service is implemented. The registry already has account and
device upsert primitives, but operators still had to edit private JSON files to
exercise the account/device side of the hosted flow.

Manual registry edits make local hosted-relay rehearsals harder to reproduce and
increase the risk of malformed account or device records.

## Decision

Add two registry-management commands:

- `hovvi account upsert/list --registry <path>`
- `hovvi device upsert/list --registry <path>`

The commands write only account/device metadata, preserve private registry file
permissions through the existing `saveRegistry` path, and do not print relay
token hashes or raw token values. Token issuance remains in `hovvi token`; OAuth
account/device registration can later reuse the same registry record shape.

## Consequences

- Local hosted-relay rehearsals can register accounts and devices without
  hand-editing JSON.
- Token entries can be scoped against explicit account and device records during
  development.
- The command does not decide hosted retention, billing, or OAuth policy.

## Validation

- `node --test test/cli-token.test.js test/registry.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
