# ADR 0101: Service Runtime Config Preflight

## Status

Accepted

## Context

The LaunchAgent now receives only `HOVVI_CONFIG`. That protects relay secrets
from launchd plists, but it also means `hovvi service start` must validate the
private config file the agent will actually read.

`hovvi doctor` can warn about missing relay URL or token, and `hovvi service
install` writes those values into private config. A user can still edit or delete
that config after install, leaving `service start` able to load an agent that
will fail later with a relay connection error.

## Decision

`hovvi service start` and `hovvi service restart` now require the active private
config to contain:

- `relay.url`;
- `relay.token`.

The preflight uses the saved private config, not transient `--relay`, `--token`,
or shell environment values, because launchd will not pass those command-line
inputs to the installed agent. Users must persist the runtime values through
`hovvi login --relay <url> --issue-token agent` or `hovvi service install
--relay <url> --token <agent-token>`.

## Consequences

- Missing runtime relay configuration fails before `launchctl`.
- The service startup path matches the config-only LaunchAgent security model.
- Manual one-shot `hovvi up --relay ... --token ...` remains available for local
  development, but unattended service startup requires persisted private config.

## Verification

- `node --test test/service.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
