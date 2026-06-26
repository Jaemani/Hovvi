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
prepares the mosh attach manifest, starts `MoshAttachSession`, applies terminal
output into `ScrollbackBuffer`, and exposes redacted user-facing error state for
SwiftUI screens.

`HovviAttachShellView`, `DeviceSidebar`, `TerminalSurfaceView`, and related row
views are presentational SwiftUI surfaces. They do not own relay or mosh state;
they render `AttachShellSnapshot` and emit closures for connect, select, attach,
input, resize, and retry actions.

`TerminalInputCommand` encodes text, paste-sized text, Return, Tab, Escape,
Ctrl-C, and backspace as terminal bytes before they enter the mosh input path.
The SwiftUI input bar sends `Data` rather than UI strings, so control keys and
text use the same attach-session flow.

`HovviMobileApp` owns the first app-shaped wiring layer. It creates a
`RelayClient`, connects and loads devices, selects sessions, attaches through
`AttachShellModel`, forwards input and resize events, and runs a conservative
receive loop while attached. Repository alpha bootstrap reads `HOVVI_RELAY_URL`,
`HOVVI_RELAY_TOKEN` or `HOVVI_TOKEN`, and `HOVVI_CLIENT_ID`, defaulting to
`ws://127.0.0.1:8787`, token `dev`, and client id `ios-alpha`.

`TerminalScreen` keeps the live terminal screen separate from tmux scrollback.
It currently supports printable text, CR/LF/backspace, basic CSI cursor
movement, clear screen, erase line, resize, basic SGR text attributes,
256-color/truecolor foreground/background colors, and alternate-screen restore.
Printable parsing preserves Swift grapheme clusters and advances common CJK and
emoji output as wide terminal cells.
Inverse SGR runs render with swapped effective foreground/background colors.
`CSI r` scroll regions keep line-feed scrolling bounded inside active margins.
`ESC M` reverse index scrolls down inside the active margins when the cursor is
at the top margin.
DEC origin mode (`CSI ? 6 h/l`) makes cursor addressing and vertical movement
respect the active scroll region.
Saved cursor sequences (`ESC 7/8` and `CSI s/u`) restore cursor position and
SGR attributes within current screen bounds.
Line insert/delete sequences (`CSI L/M`) mutate only the active scroll region.
Character insert/delete sequences (`CSI @/P`) mutate the current row from the
cursor to the right edge.
Horizontal tabs use default eight-column tab stops, support `ESC H` custom tab
stops and `CSI g` tab clearing, and clamp to the right edge when no later tab
stop exists.
Erase-character sequences (`CSI X`) blank cells from the cursor without
shifting the remaining row text.
`TerminalSurfaceView` renders the live screen when present and falls back to
`ScrollbackBuffer` before output arrives.

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
