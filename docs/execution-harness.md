# Hovvi Execution Harness

This document defines how roadmap work is broken into verifiable task units. It
exists because self-review and prompting are useful but are not strong enough to
prove correctness. Hovvi work should make mistakes visible through explicit
contracts, executable checks, traceable decisions, and review evidence.

## Core Principle

Treat the model as a proposer and implementer. Treat tests, builds, protocol
contracts, package manifests, CI, and documented decision gates as the verifier.

Self-review can generate bug candidates, but it is not an acceptance signal when
it is not backed by current-state evidence.

## Task Unit Contract

Every non-trivial roadmap slice should have a concrete contract before it is
treated as done:

- Objective: the user-visible or architecture-visible outcome.
- Scope: files, subsystems, and behavior that may change.
- Non-goals: adjacent work intentionally left out.
- Acceptance criteria: observable conditions that prove the slice works.
- Verification commands: targeted tests and broader gates appropriate to risk.
- Traceability: roadmap update and ADR when behavior, architecture, security,
  packaging, or process policy changes.

Small implementation details can be decided during the work, but acceptance
criteria and decision gates should not silently drift to match what was easiest
to implement.

## Harness Layers

Use the lightest set of layers that matches the risk, but keep the verifier
outside the model whenever possible.

1. Contract layer
   - Update or cite roadmap acceptance criteria.
   - Convert ambiguous behavior into invariants when possible.
   - State what must not regress.

2. Repository instruction layer
   - Keep stable rules in `AGENTS.md`, `docs/roadmap.md`, and this file instead
     of repeating them only in chat.
   - If the same failure pattern appears again, update the durable instruction
     or test suite rather than relying on memory.

3. Planning layer
   - For multi-file, security-sensitive, packaging, native, relay, or mobile UI
     work, maintain a short plan and update it as the work changes.
   - Stop before crossing a roadmap decision gate.

4. Deterministic verification layer
   - Prefer executable checks over natural-language claims.
   - Add regression tests for bugs or protocol gaps.
   - Keep tests narrow for narrow changes and broaden them when shared behavior,
     packaging, native ABI, relay contracts, or UI state changes.

5. Review layer
   - Review the diff against acceptance criteria, regression risk, security and
     token exposure, license/package boundaries, and missing tests.
   - Treat review as candidate-finding. Final acceptance still needs executable
     or current-state evidence.

6. Release and audit layer
   - Verify package contents before publishing.
   - Keep GPL-linked source/binaries out of the MIT npm artifact unless the
     packaging decision gate is explicitly closed.
   - Preserve CI evidence and commit history for every roadmap slice.

## Risk Levels

Low-risk changes:

- Documentation corrections, narrow tests, small diagnostics, or internal-only
  refactors.
- Required checks: syntax or targeted test when applicable, plus diff review.

Medium-risk changes:

- CLI behavior, relay messages, attach manifests, mobile state models, or
  session discovery.
- Required checks: targeted tests, broader JS or Swift smoke as applicable,
  package dry-run when npm contents may change, ADR or roadmap update when
  behavior changes.

High-risk changes:

- Authentication, token scoping, audit redaction, hosted relay policy, native
  mosh linkage, mobile app distribution, package publishing, migrations, or
  network/security boundary changes.
- Required checks: explicit decision gate if listed in the roadmap, focused
  regression tests, broad CI-equivalent local checks where practical, package or
  license review when relevant, and human approval for policy choices.

## Hovvi Verification Matrix

Use these as defaults unless a slice has a stronger local gate.

- CLI JavaScript: `npm run check`, targeted `node --test ...`, then `npm test`
  for shared behavior.
- Relay protocol: protocol/validation tests, integration relay tests, and
  `docs/protocol.md` updates for wire format changes.
- Attach manifest: manifest unit tests, JavaScript client selection tests, Swift
  decoding/selection smoke, and roadmap/protocol docs.
- Mac agent/service: service or doctor tests, token-redaction checks when logs
  are involved, and launchd behavior documented in ADRs.
- Native adapter or C ABI: `npm run native:check`, `native:adapter-check`, and
  upstream checks when GPL-linked repository-only code is involved.
- Real mosh-server attach: `native:mosh-server-harness-check`,
  `native:relay-attach-check`, and `native:relay-process-attach-check` when the
  slice affects the relay/datagram attach path.
- iOS core/UI state: `swift run --package-path apps/ios HovviMobileCoreSmoke`
  and `swift build --package-path apps/ios --product HovviMobileApp`.
- Packaging/release: `npm pack --dry-run --json`, changelog/version/tag checks
  before any publish after `0.1.0`.

## Completion Audit

Before calling a roadmap slice complete:

- Inspect the current worktree and external CI state.
- Map each acceptance criterion to evidence.
- Treat missing, indirect, or outdated evidence as incomplete.
- Confirm decision gates were not crossed.
- Confirm unrelated user changes were not reverted.
- Record the decision and validation in ADR/roadmap when the slice changes
  architecture, behavior, packaging, security, or process policy.

## Failure Memory

When a bug, missed requirement, or incorrect assumption is found:

- Add a regression test or static check when possible.
- Update this harness, `AGENTS.md`, roadmap gates, or an ADR if the failure was
  caused by an ambiguous process rule.
- Prefer durable repository evidence over relying on future chat context.

## Stop Conditions

Stop and ask for user input when:

- A roadmap decision gate would be crossed.
- The correct behavior is a product/legal/security policy choice not already
  fixed by the roadmap.
- Verification reveals a serious blocker that cannot be resolved without an
  external state change.
- Continuing would require weakening authentication, token validation,
  redaction, package/license boundaries, or mosh key validation.
