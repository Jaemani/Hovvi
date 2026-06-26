# ADR 0031: Local Relay Process Attach Check

Date: 2026-06-26

## Status

Accepted

## Context

The relay-first mosh attach path already had in-process integration coverage:
native probe, JavaScript relay datagram client, in-process relay, agent UDP
bridge, and agent-started `mosh-server`. That proves packet correctness, but it
does not exercise the installed CLI relay entrypoint, startup stdout contract,
or child-process lifecycle used by self-hosted development setups.

## Decision

Add `npm run native:relay-process-attach-check`.

The check starts `hovvi relay --port 0 --token dev` as a child process, parses
the printed relay URL, connects an in-process agent and client, prepares an
agent-started relay-datagram mosh attach manifest, and runs the repository-only
native `upstream_mosh_server_probe` through the resulting relay path.

It skips when `tmux`, `mosh-server`, or the vendored upstream mosh checkout is
unavailable. It is included in CI after the in-process native relay attach check.

## Consequences

The local self-hosted relay path is now covered at the process boundary without
starting hosted infrastructure or changing npm package contents. This still does
not implement automatic reconnect. It provides a stronger baseline for adding a
reconnecting wrapper because the underlying relay process attach path is proven
separately from in-process test fixtures.

## Validation

- `npm run check`
- `npm run native:relay-process-attach-check`
- `git diff --check`

## References

- `scripts/native-relay-process-attach-check.js`
- `scripts/native-relay-attach-check.js`
- `docs/mosh-core-integration.md`
- ADR 0027: Native Relay Attach Check.
- ADR 0030: Relay Client Disconnect Cleanup.
