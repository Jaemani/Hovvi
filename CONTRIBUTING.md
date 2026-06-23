# Contributing to Hovvi

Hovvi is early, but changes should still be traceable and testable.

## Development

```bash
npm ci
npm run check
npm test
```

Use `hovvi doctor --network` when changing platform or account-related behavior.

## Design Expectations

- Prefer existing protocol behavior from mosh and tmux over inventing new terminal semantics.
- Keep the relay unable to understand terminal payloads when a higher-level encrypted stream can carry them.
- Avoid creating or destroying user tmux sessions unless a command explicitly asks for it.
- Add or update ADRs for architectural decisions that affect protocol, security, packaging, or mobile UX.

## Pull Requests

- Include tests for protocol, relay, agent, or session behavior.
- Include docs when user-facing commands or release behavior changes.
- Keep package version changes separate from feature work unless the PR is a release PR.
