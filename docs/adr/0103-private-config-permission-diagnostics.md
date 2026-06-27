# ADR 0103: Private Config Permission Diagnostics

## Status

Accepted

## Context

Hovvi stores the relay URL, raw agent token, device id, and GitHub login state in
the private config file. `saveConfig` writes this file with owner-only
permissions, but users can copy, edit, or restore the file with broader modes.

The LaunchAgent hardening path moved secrets out of launchd plists and into
`HOVVI_CONFIG`, so doctor should make unsafe file permissions visible before
unattended service startup.

## Decision

`hovvi doctor` now reports a `private config file` diagnostic.

The check:

- warns when the file is missing;
- passes when group/world permission bits are absent;
- warns when any group/world permission bits are present and recommends
  `chmod 600 <config-path>`;
- never prints token values or config contents.

## Consequences

- Users can detect copied or restored config files with unsafe modes.
- Persisted relay tokens remain in the private config model, but the operator
  gets explicit evidence that the file is not paste-safe to leave broad.
- Missing config remains a warning, not a failure, because fresh setup may run
  doctor before login or service install.

## Verification

- `node --test test/doctor.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
