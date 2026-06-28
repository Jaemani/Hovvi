# ADR 0160: Terminal Colon SGR Colors

## Status

Accepted

## Context

`TerminalScreen` already handled semicolon-form 256-color and truecolor SGR
sequences such as `CSI 38 ; 5 ; n m` and `CSI 38 ; 2 ; r ; g ; b m`. Some
xterm-compatible terminal streams emit the equivalent color parameters with
colon separators, for example `CSI 38 : 5 : n m` or
`CSI 38 : 2 :: r : g : b m`.

Without parsing these forms, the mobile attach surface can drop color state or
misinterpret the sequence as unrelated SGR values.

## Decision

SGR parsing now normalizes colon-form extended color parameters only for
foreground/background color selectors:

- `38:5:n` maps to indexed foreground color.
- `48:5:n` maps to indexed background color.
- `38:2::r:g:b` and `38:2:r:g:b` map to RGB foreground color.
- `48:2::r:g:b` and `48:2:r:g:b` map to RGB background color.

Colon parsing is intentionally scoped to SGR color parameters. Other CSI
families keep their existing semicolon numeric parsing.

## Consequences

- xterm-style colon color SGR no longer loses color state in the live terminal
  model.
- Existing semicolon SGR behavior remains unchanged.
- This does not add new visual attributes beyond the color model already present
  in `TerminalTextAttributes`.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
