# ADR 0109: Terminal Navigation Input Keys

Date: 2026-06-28

## Status

Accepted

## Context

The iOS alpha attach shell already sends text, paste-sized text, Return, Tab,
Escape, Ctrl-C, backspace, and arrow keys through `TerminalInputCommand`.
Interactive terminal programs also expect common navigation keys that mobile
software keyboards do not expose reliably: Home, End, Page Up, Page Down, and
forward Delete.

## Decision

`TerminalInputCommand` now encodes:

- Home as `CSI H`;
- End as `CSI F`;
- Page Up as `CSI 5 ~`;
- Page Down as `CSI 6 ~`;
- forward Delete as `CSI 3 ~`.

The SwiftUI terminal input accessory exposes these commands as compact icon
buttons next to the existing arrow, Escape, Tab, Ctrl-C, and backspace controls.

## Consequences

- Mobile users can operate shell line editors, pagers, tmux copy-mode, and
  full-screen terminal apps without requiring an external keyboard.
- Input bytes remain deterministic and smoke-tested before reaching mosh.
- More advanced keyboard mode negotiation can still be added later without
  changing the existing public command cases.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`

## References

- `apps/ios/Sources/HovviMobileCore/TerminalInputCommand.swift`
- `apps/ios/Sources/HovviMobileUI/AttachShellViews.swift`
- `apps/ios/Sources/HovviMobileCoreSmoke/main.swift`
- ADR 0050: Terminal Input Command Encoding.
