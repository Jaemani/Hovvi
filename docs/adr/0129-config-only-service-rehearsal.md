# ADR 0129: Config-Only Service Rehearsal

## Status

Accepted

## Context

The Mac package target is a clean install flow where private config carries relay
URL, relay token, and device identity, the LaunchAgent plist references only
`HOVVI_CONFIG`, and the agent appears in a relay without manual port, IP, VPN, or
SSH configuration.

Previous tests covered these pieces separately: plist secret boundaries, service
runtime preflight, relay registration, and client device listing. They did not
exercise the full config-only rehearsal contract in one deterministic local
smoke.

## Decision

Add a repository smoke that rehearses the service path without invoking launchd:

- write a private config file with relay URL, relay token, and device identity.
- render `hovvi service install --print` and verify the plist contains only the
  config path, not relay URL or token material.
- resolve the agent runtime from private config with no flags.
- run doctor against the same private config and LaunchAgent status seam,
  verifying relay config, private file permissions, loaded-service config path,
  and token redaction as one clean-path check.
- start an agent connection against a local relay using a deterministic session
  discovery seam.
- verify a relay client can see the configured device and session.

`connectAgent` now accepts an injectable `listSessionsFn`, and CLI agent runtime
resolution lives in `resolveAgentRuntimeConfig` so flags, environment, private
config, defaults, interval validation, and relay credential validation are tested
outside the command wrapper.

## Consequences

- The clean Mac service contract has one local proof that does not depend on
  launchd side effects or tmux availability during early JavaScript tests.
- Doctor coverage now stays tied to the same private config and plist contract,
  so future changes cannot make install/start readiness look healthy while the
  clean service rehearsal is broken.
- The production agent still uses real tmux session discovery by default.
- The LaunchAgent still references only `HOVVI_CONFIG`; no relay secret is added
  back to the plist.
- This does not choose hosted relay pricing, retention, data policy, WireGuard,
  Android, or mobile app distribution policy.

## Validation

- `node --test test/agent-runtime-config.test.js test/service-rehearsal.test.js test/integration-relay.test.js test/service.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
