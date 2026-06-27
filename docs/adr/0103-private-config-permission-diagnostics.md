# ADR 0103: Private Config Permission Diagnostics

## Status

Accepted

## Context

Hovvi stores the relay URL, raw agent token, device id, and GitHub login state in
the private config file. `saveConfig` writes this file with owner-only
permissions and creates its directory with owner-only permissions when needed,
but users can copy, edit, or restore the file or directory with broader modes.

The LaunchAgent hardening path moved secrets out of launchd plists and into
`HOVVI_CONFIG`, so doctor should make unsafe file permissions visible before
unattended service startup.

## Decision

`hovvi doctor` now reports `private config directory` and `private config file`
diagnostics.

The directory check:

- warns when the directory is missing;
- passes when group/world permission bits are absent;
- warns when any group/world permission bits are present and recommends
  `chmod 700 <config-dir>`;
- never prints token values or config contents.

The file check:

- warns when the file is missing;
- passes when group/world permission bits are absent;
- warns when any group/world permission bits are present and recommends
  `chmod 600 <config-path>`;
- never prints token values or config contents.

## Consequences

- Users can detect copied or restored config files with unsafe modes.
- Users can detect a searchable/readable config directory even when the config
  file itself is private.
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
