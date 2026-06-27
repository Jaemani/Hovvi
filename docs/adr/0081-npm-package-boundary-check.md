# ADR 0081: npm Package Boundary Check

## Status

Accepted

## Context

Hovvi keeps upstream mosh source in the repository for native integration and
CI validation, but the current npm package is MIT and must not silently include
vendored GPL mosh source or GPL-linked native artifacts.

Manual `npm pack --dry-run` inspection was useful but not durable. A future
change to `package.json` could accidentally include `native/mosh-core/vendor/`
or build outputs unless CI and prepublish checks reject them.

## Decision

Add `npm run package:boundary-check`.

The check runs `npm pack --dry-run --json`, inspects the actual package file
list, and rejects:

- `native/mosh-core/vendor/`
- `native/mosh-core/build/`
- `apps/ios/.build/`
- native binary/object artifacts under `native/mosh-core/`
- GPL-linked upstream C ABI implementation source filenames

CI runs this check immediately after the npm dry-run, and `prepublishOnly`
includes it before any future publish attempt.

## Consequences

- GPL/package boundary violations fail before publication.
- The release decision gate remains explicit instead of relying on reviewer
  memory.
- Future packaging changes must either keep the MIT artifact clean or close the
  roadmap license/compliance gate first.

## Validation

- `npm run package:boundary-check`
- `npm test`
- `npm pack --dry-run --json`
