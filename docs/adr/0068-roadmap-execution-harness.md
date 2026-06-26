# ADR 0068: Codify the Roadmap Execution Harness

Date: 2026-06-27

## Status

Accepted

## Context

Hovvi is being developed through long-running agent-assisted roadmap slices. The
project already has strong technical gates for relay, native mosh, Swift, and
packaging work, but the process rule was mostly implicit: rely on plans,
reviews, tests, ADRs, and CI instead of model self-confidence.

The user provided an explicit process requirement: reduce logical mistakes by
designing verifiable task units and failure-detection layers, not merely by
asking an LLM to think harder or self-review.

## Decision

Add `docs/execution-harness.md` as the durable process contract for Hovvi
roadmap execution. The harness requires each meaningful slice to be evaluated
through:

- a task contract with scope, non-goals, acceptance criteria, and verification;
- deterministic checks such as tests, builds, package dry-runs, native smokes,
  Swift smokes, or CI;
- ADR and roadmap traceability for behavior, architecture, packaging, security,
  and process decisions;
- explicit stop conditions for roadmap decision gates and security/license
  boundaries;
- failure memory through regression tests or durable instruction updates.

## Consequences

- Future agent work has a repository-local reference for what "done" means.
- Self-review remains useful for finding candidate issues, but it is not treated
  as proof of completion without current-state evidence.
- The harness adds process overhead only for non-trivial or risky work; narrow
  documentation or test changes can use a lighter subset.
- Completion of the full roadmap remains unproven until every milestone's
  acceptance criteria has current evidence.

## Validation

- `npm run check`
- `npm test`
- `npm pack --dry-run --json`
