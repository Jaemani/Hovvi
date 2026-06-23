# ADR 0004: npm First, Homebrew Formula Template

## Status

Accepted

## Decision

Hovvi starts as an npm-installable CLI package. Homebrew packaging is represented by a formula template until release artifacts are published.

## Rationale

Node 22 is available in the current development environment and supports a fast cross-platform CLI/relay implementation. Rust can replace internals later if performance or distribution requirements justify it.

## Consequences

- `npm install -g hovvi` is the initial distribution target.
- A Homebrew formula is kept in `packaging/homebrew/` for release readiness.
- The CLI boundaries should stay stable enough that internals can move to Rust without changing user commands.
