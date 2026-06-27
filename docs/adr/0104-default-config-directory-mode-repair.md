# ADR 0104: Default Config Directory Mode Repair

## Status

Accepted

## Context

Hovvi persists relay credentials in `~/.hovvi/config.json` by default. The config
file is written with owner-only permissions, and `hovvi doctor` warns when the
config directory or file has group/world permission bits.

On repeated local setup, a user may already have a broad `~/.hovvi` directory
from manual edits, restore tooling, or earlier experiments. Leaving that
directory searchable by group/world weakens the private config boundary even
when the config file itself is repaired to `0600`.

Custom `HOVVI_CONFIG` paths are different: their parent directory may be owned by
another operator policy, test harness, mounted volume, or temp workspace. Hovvi
should not silently chmod arbitrary custom parent directories.

## Decision

`saveConfig` repairs the default Hovvi config directory to `0700` whenever it
writes `~/.hovvi/config.json`.

For custom `HOVVI_CONFIG` paths, `saveConfig` keeps existing parent directory
permissions unchanged. It still creates missing custom directories with private
mode when possible and writes the config file itself as `0600`.

`hovvi doctor` remains the diagnostic layer for custom parent directories with
broad permissions.

## Consequences

- Default Mac setup becomes safer after login, token issuance, and agent config
  writes without requiring manual chmod.
- Custom config paths stay under explicit operator control.
- Broad custom directories remain visible through `hovvi doctor` instead of
  being silently mutated.

## Verification

- `node --test test/config.test.js`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
