# ADR 0169: Terminal CSI Intermediate Boundary

## Status

Accepted

## Context

Mobile attach receives terminal output in relay data frames that can contain
both supported terminal controls and unsupported xterm/tmux metadata controls.
The parser already buffered incomplete ESC/CSI controls across frame boundaries,
but a complete unsupported CSI could still return no token. That ended the
current parse loop and dropped later printable bytes from the same frame.

CSI also has an intermediate-byte range (`0x20...0x2F`) that is distinct from
parameter bytes. xterm-style controls such as cursor-style selection and soft
terminal reset use this range. Hovvi does not need to implement every such
control yet, but it must consume complete unsupported controls without printing
control bytes, corrupting terminal state, or losing following text.

## Decision

`TerminalEscapeParser` now separates CSI parameter bytes from intermediate
bytes. Complete unsupported CSI sequences return `.ignored`; only incomplete CSI
sequences are retained as `incompleteControlPrefix` for the next receive frame.

For now, CSI sequences with intermediate bytes are consumed and ignored unless a
future terminal feature explicitly implements their semantics.

## Consequences

- Unsupported complete CSI controls no longer terminate parsing for the
  remaining bytes in the same relay frame.
- Split intermediate CSI controls are still buffered until the final byte is
  received.
- Cursor-style and soft-reset style metadata from xterm/tmux can pass through
  the mobile terminal without visible artifacts.
- This does not add new rendered terminal behavior; it is a parser boundary and
  corruption-prevention change.

## Verification

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
- `npm run native:check`
- `npm run ios:simulator-screenshot-matrix-check` skipped locally because the
  active developer directory is Command Line Tools, not full Xcode.
