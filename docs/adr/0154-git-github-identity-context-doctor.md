# ADR 0154: Git/GitHub Identity Context Doctor Check

## Status

Accepted

## Context

Hovvi Mac onboarding depends on several independent identity surfaces:

- local Git commit author identity from `git config`
- GitHub CLI authentication from `gh`
- GitHub SSH authentication from `ssh -T git@github.com`

`hovvi doctor --network` already warns when GitHub CLI and GitHub SSH resolve to
different accounts. Users can still confuse that with `git user.name`, which is
only commit metadata and does not need to match the GitHub login.

## Decision

`hovvi doctor --network` now emits a `git/github identity context` item after
the GitHub account consistency check.

The item reports the local Git author name/email and the GitHub account used by
network operations. It passes when the roles are clear, warns when the Git author
name looks like a different GitHub-style login, and explicitly says that
`git user.name` is not required to match the GitHub login.

The check does not mutate Git config, GitHub credentials, SSH keys, relay
tokens, or account registry state.

## Consequences

- Users can distinguish commit author metadata from GitHub authentication during
  first-run setup.
- Hovvi still treats gh/SSH mismatch as the actionable GitHub-account risk.
- Real-name Git authors are not warned merely because they differ from the
  GitHub login.

## Validation

- `node --test test/doctor.test.js`
- Broader JavaScript checks should run before commit.
