# ADR 0050: Terminal Input Command Encoding

## Status

Accepted

## Context

The first iOS attach shell could send text from a SwiftUI input field, but real
terminal use also needs explicit Return, Tab, Escape, interrupt, and backspace
input. Those are byte-level terminal inputs, not UI strings. Keeping the UI
callback string-shaped made it easy to blur text entry, paste-sized text, and
control keys.

Interactive tmux, Claude Code, Codex, shell history, and editor prompts also
need cursor-key navigation before custom keyboard integration exists.

## Decision

Add `TerminalInputCommand` to `HovviMobileCore`.

The command model maps terminal input actions to bytes:

- text preserves UTF-8 bytes exactly, including pasted multi-line text;
- Return sends carriage return (`0x0D`);
- Tab sends horizontal tab (`0x09`);
- Escape sends `0x1B`;
- interrupt sends Ctrl-C (`0x03`);
- backspace sends DEL (`0x7F`);
- arrow up/down/right/left send ANSI CSI `ESC [ A/B/C/D`.

`HovviAttachShellView` and `TerminalDetail` now send `Data` instead of `String`
through their input callback. The app controller forwards those bytes directly
to `AttachShellModel.sendInput`, so text, paste-sized input, and control keys all
use the same mosh input path.

## Consequences

- The mobile terminal shell has explicit controls for common terminal keys and
  cursor navigation before custom keyboard integration exists.
- Paste-sized text remains byte-preserving and does not implicitly add Return.
- Future hardware-keyboard handling can reuse the same command model.
- The on-screen command toolbar scrolls horizontally on narrow screens so adding
  cursor keys does not force button labels or controls to overlap.
- Bracketed paste negotiation is handled separately by the terminal screen
  model; this ADR defines the client-side byte encoding path.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
