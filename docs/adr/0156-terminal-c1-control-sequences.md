# ADR 0156: Terminal C1 Control Sequences

## Status

Accepted

## Context

`TerminalScreen` already handled ESC-prefixed CSI and OSC sequences. Some
terminal streams can also use 8-bit C1 controls, notably CSI (`U+009B`), OSC
(`U+009D`), and ST (`U+009C`). If these bytes reach the mobile terminal parser
as Unicode scalars, treating them as printable characters can corrupt the live
screen and leak shell/tmux metadata into terminal text.

## Decision

`TerminalEscapeParser` now recognizes:

- C1 CSI (`U+009B`) and routes it through the existing CSI parser.
- C1 OSC (`U+009D`) and skips it through the existing OSC state machine.
- C1 ST (`U+009C`) as an OSC terminator, including when an OSC spans receive
  frames.

The change reuses the existing ESC-based parser paths and does not add broader
terminal emulation beyond C1 CSI/OSC/ST handling.

## Consequences

- C1 CSI cursor/mode sequences no longer render as visible text.
- OSC metadata emitted with C1 delimiters is skipped instead of polluting the
  live terminal surface.
- Existing ESC-based CSI/OSC behavior remains unchanged.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
