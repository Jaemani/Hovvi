# ADR 0098: Service Install Config Prerequisites

## Status

Accepted

## Context

The LaunchAgent plist now stores only `HOVVI_CONFIG`; relay URL and token live
in private config. `hovvi service install` still allowed local development
fallbacks (`ws://127.0.0.1:8787` and `dev`) when no relay config was supplied.

That behavior could install an unattended service that appears configured but
cannot join the intended hosted relay. It also hid whether the plist points at
the same config file the CLI just read.

## Decision

`hovvi service install` now requires a relay URL and agent token from one of:

- explicit `--relay` / `--token` flags
- `HOVVI_RELAY_URL` / `HOVVI_RELAY_TOKEN`
- private Hovvi config, usually created by `hovvi login --relay <url>
  --issue-token agent`

The CLI passes the active `HOVVI_CONFIG` path to the LaunchAgent installer so
the plist points at the same private config file used during installation.

Local development fallbacks remain available for `hovvi up`, relay smoke tests,
and explicit command-line runs, but not for unattended service installation.

## Consequences

- Service installation fails early when hosted/login setup is incomplete.
- `hovvi service install --print` no longer prints a misleading plist without
  relay credentials in config.
- Relay token material still stays out of the plist.

## Validation

- `node --test test/service.test.js test/doctor.test.js`
- `npm run check`
