# ADR 0100: Service Start Config Preflight

## Status

Accepted

## Context

LaunchAgent plists now keep relay secrets out of launchd and point at one
private `HOVVI_CONFIG` file. `hovvi doctor` and `hovvi service status` can show
that path and warn when it differs from the active CLI config, but
`hovvi service start` could still load an old or drifted plist.

That made a common setup failure visible only after launchd started the agent and
logs had to be inspected.

## Decision

`hovvi service start` and `hovvi service restart` now preflight the installed
LaunchAgent plist before calling `launchctl`.

The preflight requires:

- the plist has an `HOVVI_CONFIG` environment entry;
- that path matches the active CLI `configPath()`.

If either check fails, the command exits with a reinstall instruction instead of
loading the service.

## Consequences

- Old LaunchAgent plists with relay credentials or no `HOVVI_CONFIG` cannot be
  started accidentally.
- Config drift fails before launchd, so users do not need to inspect logs for
  this class of startup failure.
- Users who intentionally switch `HOVVI_CONFIG` must reinstall the service from
  that config before starting it.

## Verification

- `node --test test/service.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
