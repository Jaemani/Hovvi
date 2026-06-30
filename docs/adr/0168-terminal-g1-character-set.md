# ADR 0168: Terminal G1 Character Set

## Status

Accepted

## Context

Hovvi's iOS alpha attach shell renders live terminal bytes from mosh frames.
`TerminalScreen` already consumed G0 ASCII/DEC special graphics designations
such as `ESC ( B` and `ESC ( 0`, which covers many tmux and ncurses line
drawing sequences.

Some VT/xterm-compatible programs instead designate DEC special graphics into
G1 with `ESC ) 0`, then switch the active GL bank with SO (`0x0E`) and SI
(`0x0F`). If Hovvi ignores that bank switching, line drawing characters can
render as plain ASCII, or raw control bytes can leak into the live terminal
surface. Streams may also emit UTF-8 designation controls such as `ESC % G`,
which should be consumed rather than printed.

## Decision

Extend `TerminalScreen` to track:

- separate G0 and G1 character-set designations;
- the active GL character-set bank;
- SO/SI selection of G1/G0;
- UTF-8 designation controls as consumed no-op controls.

Saved cursor and alternate-screen snapshots now preserve both character-set
designations and the active bank. Existing G0-only behavior remains unchanged.

## Consequences

- tmux/ncurses line drawing remains stable when the stream uses G1 plus SO/SI
  instead of G0 designation alone.
- Raw SI/SO bytes received across relay data frames are parsed as terminal
  controls and do not render as visible text.
- UTF-8 designation controls no longer leak `%G` text into the terminal surface.
- This does not implement G2/G3, locking shifts beyond SI/SO, single shifts,
  national replacement character sets, or full VT character-set parity.

## Verification

- `swift run --package-path apps/ios HovviMobileCoreSmoke`
- `swift build --package-path apps/ios --product HovviMobileApp`
- `npm run check`
- `npm test`
- `npm run package:boundary-check`
- `npm pack --dry-run --json`
- `npm run native:check`
