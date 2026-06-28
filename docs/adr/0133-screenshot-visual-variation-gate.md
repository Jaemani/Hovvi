# ADR 0133: Screenshot Visual Variation Gate

## Status

Accepted.

## Context

The iOS simulator screenshot matrix already requires expected fixtures,
well-formed PNGs, nonblank images, minimum dimensions, minimum color count, and
distinct fixture hashes. That proves the app launches and renders different
states, but a nearly flat screenshot with a tiny colored artifact can still pass
the existing checks.

The iOS alpha milestone needs stronger rendering evidence before exact golden
baselines are introduced.

## Decision

Extend screenshot matrix metadata with:

- `differentPixels`
- `differentPixelRatio`

Add default minimums for both fields. The matrix now fails when captured images
do not contain enough pixel variation relative to their total pixel count.

This remains a deterministic quality gate, not a visual design approval or
pixel-perfect golden baseline.

## Validation

- Unit tests verify the new metadata fields are emitted.
- Unit tests verify undersized or low-variation screenshots fail artifact
  validation.
- CI continues to run the simulator screenshot matrix with
  `--require-captured`.

## Consequences

The simulator gate catches more rendering regressions such as mostly blank,
flat, or incorrectly clipped fixture views while preserving stable fixture-hash
and nonblank checks.
