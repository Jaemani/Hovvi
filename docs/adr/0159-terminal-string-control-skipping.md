# ADR 0159: Terminal String Control Skipping

## Status

Accepted

## Context

`TerminalScreen` skipped OSC strings so terminal titles and integration metadata
would not corrupt the mobile live screen. Other VT string controls can also
appear in terminal traffic, especially DCS passthrough/control data from tmux or
terminal integrations. If DCS, PM, APC, or SOS payload bytes are rendered as
printable text, the relay-backed attach surface can show protocol metadata
instead of the remote terminal grid.

OSC differs from the other string controls because it can terminate with BEL or
ST. DCS, PM, APC, and SOS should be skipped until ST.

## Decision

`TerminalEscapeParser` now treats string-control skipping as a shared parser
state:

- OSC (`ESC ]` and C1 `U+009D`) skips until BEL, ESC-ST, or C1 ST.
- DCS (`ESC P` and C1 `U+0090`) skips until ESC-ST or C1 ST.
- SOS (`ESC X` and C1 `U+0098`) skips until ESC-ST or C1 ST.
- PM (`ESC ^` and C1 `U+009E`) skips until ESC-ST or C1 ST.
- APC (`ESC _` and C1 `U+009F`) skips until ESC-ST or C1 ST.

The skip state persists across `TerminalScreen.apply` calls so split receive
frames do not leak partial payloads into visible terminal text.

## Consequences

- tmux or terminal integration string payloads no longer render as live terminal
  text when they use DCS/PM/APC/SOS.
- OSC keeps its BEL terminator behavior, while ST-only controls do not end on
  BEL.
- This remains a parser sanitation boundary for the current attach path, not a
  full implementation of DCS or other string-control semantics.

## Validation

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
