# ADR 0054: Bracketed Paste Input

## Status

Accepted

## Context

The iOS alpha shell could send text and paste-sized text as UTF-8 bytes, but
terminal applications often enable bracketed paste with `CSI ? 2004 h` so pasted
content is not interpreted as typed commands. Without tracking that mode, a
multi-line paste can accidentally execute line breaks in shells and editors.

## Decision

`TerminalScreen` now tracks bracketed paste mode from:

- `CSI ? 2004 h` enable;
- `CSI ? 2004 l` disable.

`TerminalInputCommand` now has `paste(_:bracketed:)`. When bracketed paste is
enabled, paste input is wrapped with `ESC [ 200 ~` and `ESC [ 201 ~`. When the
mode is disabled, paste input remains raw UTF-8.

`TerminalDetail` keeps ordinary single-line input as `.text`. Multi-line input
uses `.paste` and reads the current terminal screen bracketed-paste state from
`AttachShellSnapshot`.

## Consequences

- Mobile paste-sized input is safer for shells and editors that enable
  bracketed paste.
- The app does not force bracketed paste when the remote terminal has not
  negotiated it.
- Native clipboard event handling and explicit paste buttons can reuse the same
  command model later.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
