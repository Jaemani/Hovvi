# ADR 0153: iOS Screenshot Contract Hash Artifact

Date: 2026-06-28

## Status

Accepted

## Context

ADR 0152 moved iOS screenshot fixture semantics into
`docs/ios-screenshot-fixtures.json` and made Swift smoke validate the preview
fixtures against that contract. The simulator screenshot matrix artifact still
needed a durable way to show which exact fixture contract produced a captured
PNG set.

Without a contract hash, later CI artifact review can see fixture names and
semantic expectations but cannot prove whether the artifact was generated from
the same repository contract currently under review.

## Decision

The screenshot matrix harness now hashes `docs/ios-screenshot-fixtures.json`
with SHA-256 when loading the fixture contract. Matrix artifacts include:

- fixture contract schema version,
- fixture contract SHA-256, and
- fixture contract fixture count.

The artifact verifier rejects missing or stale contract metadata by comparing
the artifact fields against the currently loaded repository contract.

## Consequences

- Screenshot artifacts are more reproducible and auditable.
- Fixture contract drift becomes visible in unit tests and CI artifact
  validation.
- This remains a verifier-only change. It does not change app runtime behavior,
  mobile distribution, relay protocol, native mosh linkage, or npm package
  license boundaries.

## Validation

- `node --test test/ios-simulator-screenshot-matrix.test.js`

## References

- `docs/ios-screenshot-fixtures.json`
- `src/ios-simulator-screenshot-matrix.js`
- `test/ios-simulator-screenshot-matrix.test.js`
