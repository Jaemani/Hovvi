# ADR 0158: Terminal Combined Private Modes

## Status

Accepted

## Context

`TerminalScreen` already tracked DEC private modes used by mobile attach, such
as application cursor keys, autowrap, cursor visibility, alternate screen,
origin mode, and bracketed paste. The parser previously returned one token for a
private-mode CSI sequence, so a combined sequence such as `CSI ? 25 ; 2004 h`
could apply cursor visibility while dropping bracketed paste mode.

Combined DEC private-mode sequences are valid terminal traffic and can be
emitted by shells, tmux, or terminal applications. Dropping later modes causes
mobile input and live-screen state to diverge from the remote terminal.

## Decision

`TerminalEscapeParser` now parses DEC private-mode parameter lists into a
`privateModes` token. `TerminalScreen` applies each supported mode in parameter
order through the same state transitions as the previous single-mode paths.

Supported modes remain intentionally limited to the current attach-shell needs:

- `1`: application cursor keys.
- `6`: origin mode.
- `7`: autowrap.
- `25`: cursor visibility.
- `47`, `1047`, `1049`: alternate screen.
- `2004`: bracketed paste.

Unsupported private modes are ignored rather than rendered as text.

## Consequences

- Combined private-mode CSI sequences update all supported terminal states.
- Bracketed paste and navigation input remain aligned with the remote terminal
  when modes are grouped in one CSI sequence.
- This does not broaden the product into a full terminal emulator; unsupported
  private modes remain out of scope until a mosh/tmux attach case requires them.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
