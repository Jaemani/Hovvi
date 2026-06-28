# ADR 0123: iOS Screenshot Matrix Distinctness

Date: 2026-06-28

## Status

Accepted

## Context

The iOS simulator screenshot matrix validated that each deterministic fixture
produced a well-formed nonblank PNG. That proved the app launched and rendered
something, but it would not catch a fixture selector regression where every
launch silently rendered the same state.

## Decision

Extend PNG metadata with `byteLength` and `sha256`.

Require matrix fixture captures to have distinct PNG SHA-256 hashes by default.
The check remains fixture-level, not a golden screenshot assertion: it proves the
selector produced different rendered states without freezing exact pixels.

Write a versioned matrix artifact summary beside the raw per-fixture results.
The artifact records expected fixtures, captured fixture count, per-fixture PNG
hashes, nonblank status, and distinct-image invariants. This keeps CI evidence
machine-auditable without requiring CoreSimulator reruns.

## Consequences

- Simulator CI can now catch fixture selector regressions where all fixtures
  render the same screen.
- The duplicate-image gate also caught the first capped viewport fixture being
  visually identical to `attached-coding-agent`; the fixture now carries
  cap-specific live rows and visible session metadata instead of only changing
  hidden terminal state.
- Artifact metadata becomes more useful for auditing and future visual baseline
  work.
- The artifact schema version gives future visual baselines a compatibility
  boundary instead of relying on ad hoc JSON result shape.
- Exact golden comparisons remain intentionally out of scope until the UI is
  stable enough to version pixel baselines.

## Validation

- `node --test test/png-image-stats.test.js`
- `node --test test/ios-simulator-screenshot-matrix.test.js`
- `npm run check`
- `npm test`

## References

- `src/png-image-stats.js`
- `src/ios-simulator-screenshot-matrix.js`
- `test/png-image-stats.test.js`
- `test/ios-simulator-screenshot-matrix.test.js`
