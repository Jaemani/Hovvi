# ADR 0137: iOS Screenshot Semantic Artifact

## Status

Accepted.

## Context

The iOS simulator screenshot matrix now proves that expected fixtures launch,
render nonblank PNGs, produce distinct image hashes, and meet minimum image
quality and variation bounds. That evidence is useful, but it still only
describes image properties.

The iOS alpha attach shell needs CI artifacts that also explain which product
state each deterministic fixture is meant to prove. Without a semantic fixture
manifest, a future fixture rename or selector drift could preserve image
quality while weakening the audit trail.

## Decision

Upgrade the screenshot matrix artifact schema to version 2.

Each expected fixture now carries a semantic expectation:

- `role`
- `state`
- `requiredSignals`

The matrix artifact records the expectation for every expected fixture and for
each captured screenshot entry. The artifact verifier fails when an expected
fixture omits semantic expectations or when a screenshot entry drifts from the
expected expectation.

This remains a metadata and traceability gate. It does not introduce
pixel-perfect golden baselines or OCR-based UI assertions.

## Validation

- `node --test test/ios-simulator-screenshot-matrix.test.js`
- `node --check src/ios-simulator-screenshot-matrix.js`

## Consequences

CI screenshot artifacts now answer both questions:

- Did each fixture render a useful image?
- Which mobile attach state was each fixture supposed to prove?

The schema version bump makes downstream audit tooling treat the semantic
manifest as part of the artifact contract.
