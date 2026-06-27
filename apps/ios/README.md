# Hovvi iOS Alpha

The iOS app is intentionally not scaffolded as a throwaway UI yet. Hovvi is native-first for mobile because terminal attach, keyboard behavior, background lifecycle, mosh-compatible transport, and future Network Extension work are platform-sensitive.

`HovviMobileCore` is a Swift Package that pins the first native protocol models
and JSON coding behavior. `HovviMobileUI` is the first SwiftUI target for the
native attach shell. `HovviMobileApp` is the SwiftUI app entry target that wires
the shell view to `AttachShellModel`. Run:

```bash
swift build --package-path apps/ios
swift build --package-path apps/ios --product HovviMobileApp
swift run --package-path apps/ios HovviMobileCoreSmoke
npm run ios:simulator-preflight
```

The package currently covers flattened relay envelopes, outgoing client message
builders, incoming message dispatch, response matching, a native
`URLSessionWebSocketTask` relay client, relay datagram attach coordination, and
the Swift C ABI wrapper for the native mosh core boundary. The UI target compiles
the first device/session/terminal/error views against `AttachShellSnapshot`.

The relay client exposes both low-level send/receive methods and app-facing request APIs:

- `listDevices(timeout:)`
- `prepareAttachManifest(deviceId:sessionName:lines:create:timeout:)`
- `fetchScrollbackResult(deviceId:sessionName:lines:timeout:)`
- `openForward(deviceId:remoteHost:remotePort:timeout:)`
- `readForwardFrame(streamId:timeout:)`
- `openDatagram(deviceId:label:remoteHost:remotePort:maxDatagramBytes:timeout:)`
- `readDatagramFrame(channelId:timeout:)`

These APIs run a single receive loop, match responses by relay request id, and surface timeout/request failures explicitly.

Use `connect(startReceiveLoop: true)` to eagerly route messages, or call the app-facing APIs after `connect()` and let them start the loop on first use. Manual `receive()` remains available when the loop is not active.

Forward streams model the relay path that will carry SSH/mosh-compatible transport. `openForward` waits for `forward.ready`, `sendForwardData` writes base64 relay frames, and `readForwardFrame` queues incoming data/end frames per stream.

Datagram channels model the relay path for mosh-compatible UDP-like transport. They are still carried over WebSocket in the relay MVP, but the protocol boundary is distinct from byte streams. The Mac agent can bridge a datagram channel to a local UDP endpoint such as a `mosh-server` port.

`MoshRelayDatagramSession` validates attach manifests, opens relay datagram
channels, sequences outbound packets, and reads opaque inbound mosh packets.
`MoshAttachSession` composes that datagram session with a `MoshCoreEngine` and
flushes core frames back through the relay.

`AttachShellModel` is the first UI-facing attach coordinator. It is an actor that
loads relay devices, tracks selected Mac/session, fetches tmux scrollback,
prepares the mosh attach manifest, starts `MoshAttachSession`, applies live
terminal output into `TerminalScreen`, and exposes redacted user-facing error
state for SwiftUI screens. Live mosh bytes are not appended to tmux-native
scrollback history.
Failures carry a recovery action so the app can distinguish relay reconnect
from session reattach, while preserving the selected Mac/session and last
terminal state after an interrupted attach.

`HovviAttachShellView`, `DeviceSidebar`, `TerminalSurfaceView`, and related row
views are presentational SwiftUI surfaces. They do not own relay or mosh state;
they render `AttachShellSnapshot` and emit closures for connect, select, attach,
input, resize, and retry actions.

`TerminalInputCommand` encodes text, paste-sized text, Return, Tab, Escape,
Ctrl-C, backspace, ANSI arrow keys, Home, End, Page Up, Page Down, and forward
Delete as terminal bytes before they enter the mosh input path. The SwiftUI
input bar sends `Data` rather than UI strings, so control keys and text use the
same attach-session flow.
DEC application cursor-key mode (`CSI ? 1 h/l`) is tracked by the terminal
screen, and toolbar arrows switch between normal CSI arrow bytes and SS3
application arrow bytes based on that mode.
Multi-line input is treated as paste-sized input. When the remote terminal has
enabled bracketed paste with `CSI ? 2004 h`, Hovvi wraps the bytes in
`ESC [ 200 ~` and `ESC [ 201 ~`; otherwise it sends raw UTF-8.

`HovviMobileApp` owns the first app-shaped wiring layer. It creates a
`RelayClient`, connects and loads devices, selects sessions, attaches through
`AttachShellModel`, forwards input and resize events, and runs conservative
receive and mosh tick loops while attached. Repository alpha bootstrap reads
`HOVVI_RELAY_URL`, `HOVVI_RELAY_TOKEN` or `HOVVI_TOKEN`, and
`HOVVI_CLIENT_ID`, defaulting to `ws://127.0.0.1:8787`, token `dev`, and client
id `ios-alpha`.
`AppBootstrapConfig` owns that parsing in `HovviMobileCore`, records whether the
token came from `HOVVI_RELAY_TOKEN`, legacy `HOVVI_TOKEN`, or the explicit
development default, and exposes redacted token text for diagnostics.
The retry action follows `AttachShellRecoveryAction`, reconnecting to the relay
for browsing failures and reattaching the selected session for live terminal
failures.
Repeated resize events for the current terminal size are ignored by both the app
controller and `AttachShellModel`, so layout churn does not produce duplicate
mosh resize packets.

`AttachShellModel.tick(nowMs:)` drives scheduled mosh core progress. The app
tick loop follows `nextTickAfterMs` when present and otherwise polls
conservatively while attached so input, receive, retransmit, ack, prediction,
and shutdown progress all use the same frame application path.

`TerminalScreen` keeps the live terminal screen separate from tmux scrollback.
It currently supports printable text, CR/LF/backspace, basic CSI cursor
movement, erase display/line modes, resize, basic SGR text attributes,
256-color/truecolor foreground/background colors, and alternate-screen restore.
Printable parsing preserves Swift grapheme clusters and advances common CJK and
emoji output as wide terminal cells.
Inverse SGR runs render with swapped effective foreground/background colors.
`CSI r` scroll regions keep line-feed scrolling bounded inside active margins.
`ESC M` reverse index scrolls down inside the active margins when the cursor is
at the top margin.
Explicit scroll up/down sequences (`CSI S/T`) mutate only the active scroll
region when one is set, otherwise the full live screen.
DEC origin mode (`CSI ? 6 h/l`) makes cursor addressing and vertical movement
respect the active scroll region.
DEC autowrap mode (`CSI ? 7 h/l`) is enabled by default and can be disabled so
right-edge output stays on the current row instead of forcing a line feed.
Cursor next/previous line (`CSI E/F`) and horizontal absolute positioning
(`CSI G`/`` ` ``) are supported with bounds clamping.
Cursor movement aliases (`CSI a/e/d`) are also supported for horizontal
relative, vertical relative, and vertical absolute positioning.
Bracketed paste mode (`CSI ? 2004 h/l`) is tracked for mobile paste input.
Application cursor-key mode (`CSI ? 1 h/l`) is tracked for mode-aware mobile
arrow-key input.
Autowrap mode (`CSI ? 7 h/l`) is tracked for right-edge terminal output.
Cursor visibility (`CSI ? 25 h/l`) is tracked separately from terminal text.
The SwiftUI surface projects the live cursor as separate row metadata and draws
it as an overlay, so cursor rendering does not corrupt scrollback or line
content. Blank live screens still project rows after live terminal bytes arrive,
so a cleared terminal can show the insertion point while pre-live attach keeps
the scrollback-only fallback.
Saved cursor sequences (`ESC 7/8` and `CSI s/u`) restore cursor position and
SGR attributes within current screen bounds.
Line insert/delete sequences (`CSI L/M`) mutate only the active scroll region.
Character insert/delete sequences (`CSI @/P`) mutate the current row from the
cursor to the right edge.
OSC sequences (`ESC ] ... BEL` and `ESC ] ... ESC \`) are skipped, including
when split across receive frames, so title and terminal-integration metadata do
not corrupt live terminal text.
G0 character set designations consume `ESC ( B` for ASCII and `ESC ( 0` for DEC
special graphics, mapping common line-drawing bytes to Unicode box drawing
characters.
Horizontal tabs use default eight-column tab stops, support `ESC H` custom tab
stops and `CSI g` tab clearing, and clamp to the right edge when no later tab
stop exists.
Erase-character sequences (`CSI X`) blank cells from the cursor without
shifting the remaining row text.
Erase display/line sequences (`CSI J/K`) support modes 0, 1, and 2 while
preserving cursor position.
RIS (`ESC c`) resets the live terminal screen, cursor, attributes, modes,
character set, tab stops, scroll region, saved cursor state, and alternate-screen
snapshot state without mutating tmux-native scrollback.
`TerminalSurfaceView` composes tmux-native scrollback rows above the current
live screen rows with separate stable IDs. Before live output arrives, it falls
back to scrollback only.
`TerminalSurfaceProjection` exposes that row composition and live cursor
metadata as public data so CI can validate render inputs before simulator/device
screenshot coverage is added.
`TerminalSurfaceViewport` caps the immediate SwiftUI render input and exposes a
bottom anchor so large scrollback snapshots do not create an unbounded terminal
view.
`AttachShellPreviewFixtures` provides deterministic browsing, attached coding
agent, failed attach, and capped viewport states for SwiftUI previews and future
simulator/device screenshot validation. The fixture includes a selected Mac,
tmux sessions, detected Claude Code and Codex panes, tmux-native scrollback,
live terminal output, and a relay-datagram mosh manifest without starting a
network connection.
`npm run ios:simulator-preflight` records whether the current Mac can run future
simulator screenshot validation. It reports `skipped` when only Command Line
Tools are active and only reports `ready` when full Xcode and at least one iOS
simulator are available.

`CAbiMoshCoreEngine` imports `hovvi_mosh_core.h` through the `HovviMoshCoreC`
SwiftPM target. The current package links only the unavailable MIT scaffold; the
repository-only upstream static library remains a separate validation artifact
until the GPL mobile distribution gate is closed.

`ScrollbackBuffer` turns `session.scrollback.ready` text into stable
`ScrollbackLine` values for native scroll views. It keeps incomplete streamed
text as a stable pending line, trims old lines by configured capacity, and resets
cleanly when the user switches sessions.

The first native build should consume the relay protocol implemented by the CLI package:

- GitHub OAuth login
- device list from `devices.snapshot`
- session cards from agent `sessions.update`
- encrypted attach transport
- native tmux scrollback view backed by `tmux capture-pane`/control mode
- explicit mobile terminal keys backed by byte-level input commands

Flutter is acceptable for non-terminal app surfaces later, but the iOS alpha should keep the attach path native.

Reference UX:

1. Open app.
2. Sign in with GitHub.
3. Pick a Mac.
4. Pick a tmux/Claude/Codex session.
5. Attach with mosh-compatible live terminal behavior and native scrollback.
