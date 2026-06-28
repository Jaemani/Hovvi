# ADR 0161: Terminal Data Byte Decoder

## Status

Accepted

## Context

`TerminalScreen.apply(Data)` previously converted each incoming `Data` chunk to
a complete UTF-8 `String`. That is too strict for relay-backed mosh output:
relay datagram or native frame boundaries can split a UTF-8 scalar across
multiple reads. The live terminal path also needs to accept raw 8-bit C1 control
bytes such as `0x9B` for CSI, while still preserving UTF-8 encoded C1 scalars
such as `C2 9B`.

If a single chunk failed whole-buffer UTF-8 decoding, the terminal screen could
drop valid adjacent output and lose terminal controls.

## Decision

`TerminalScreen` now decodes terminal bytes incrementally before passing text to
the existing escape parser:

- ASCII bytes are emitted directly.
- Raw C1 bytes `0x80...0x9F` are emitted as C1 control scalars when they are not
  part of a pending UTF-8 sequence.
- UTF-8 lead bytes are buffered until the full scalar is available, allowing
  multi-byte characters to cross relay frame boundaries.
- UTF-8 continuation bytes remain part of a pending sequence when appropriate,
  so encoded C1 controls such as `C2 9B` still reach the parser as C1 scalars.
- Invalid byte sequences emit the Unicode replacement character instead of
  dropping the entire frame.

RIS reset clears the pending byte buffer with the rest of the live terminal
state.

## Consequences

- Relay-backed mosh output can split CJK, emoji, or other multi-byte UTF-8
  output across frames without losing text.
- Raw 8-bit C1 controls from terminal streams are handled through the same
  parser path as previously supported C1 Unicode scalars.
- This does not add a new terminal transport or alter relay protocol framing.
  It only hardens the mobile live-screen decoder at the `Data` boundary.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
