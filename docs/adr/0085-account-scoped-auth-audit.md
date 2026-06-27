# ADR 0085: Account-Scoped Auth Audit

## Status

Accepted

## Context

Hosted relay registration is moving from local shared-token development toward
account-scoped agent and client credentials. Operators need to trace accepted
relay authentication events back to an account without logging raw relay tokens
or token hashes.

Rejected authentication events do not have a trusted principal. Inferring an
account from an invalid token would require extra token matching on an untrusted
credential and could leak policy information.

## Decision

Relay `auth.accept` audit records now include `accountId` when the accepted
principal came from an account-scoped registry token. The existing audit
sanitizer still omits token-shaped fields, and the relay does not write raw
token values or token hashes into accepted-auth audit records.

Rejected-auth audit records remain reason-based and do not attempt to infer an
account id from invalid credentials.

## Consequences

- Hosted relay authentication can be audited by account for accepted sessions.
- Account scoping evidence is available without exposing bearer credentials.
- Failed credential attempts still avoid account-existence hints beyond the
  existing structured rejection reason.

## Validation

- `node --test test/relay.test.js test/audit.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm pack --dry-run --json`
