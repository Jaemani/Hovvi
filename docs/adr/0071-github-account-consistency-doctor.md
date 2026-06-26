# ADR 0071: GitHub Account Consistency Doctor Check

## Status

Accepted

## Context

Hovvi setup diagnostics already check local Git identity, GitHub CLI auth, and
GitHub SSH auth. Those checks were independent, so a Mac could report both `gh`
and SSH as authenticated while they pointed at different GitHub accounts.

That mismatch is a common source of confusing repository access, package
publishing, and remote setup behavior. It is also directly relevant to Hovvi's
Mac-side onboarding goal: the user should not have to debug hidden identity
state after installing the package.

## Decision

`hovvi doctor --network` now parses the GitHub account from:

- `gh auth status --hostname github.com`
- `ssh -T git@github.com`

When both accounts are present, doctor reports a pass only if they match
case-insensitively. If they differ, doctor reports a warning with both account
names. If either account cannot be parsed, doctor reports that the comparison
could not be made.

## Consequences

- Users can see when GitHub CLI and SSH are authenticated as different accounts.
- The check is network-mode only, matching the existing gh/SSH probes.
- The check does not change Git identity, GitHub credentials, SSH keys, relay
  authentication, or token policy.

## Validation

- `node --test test/doctor.test.js`
- Broader JavaScript checks should run before commit.
