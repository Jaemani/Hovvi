# Hovvi Roadmap

This roadmap records confirmed execution goals only. Work should continue through
the confirmed items without waiting for more product input. Stop only at the
decision gates listed below, or when a severe technical/security/legal blocker is
found.

## Product Target

Hovvi lets a developer install a Mac-side package once, sign in on mobile, pick a
device, and resume long-running development sessions such as tmux, cmux, Claude
Code, and Codex without configuring ports, IP addresses, VPNs, or SSH tunnels.

The compatibility target is mosh semantics over a Hovvi relay/datagram path. The
product is not a new terminal multiplexer; it is a mature wrapper around proven
session, transport, and terminal primitives.

## Fixed Architecture

- Connectivity is relay-first. WireGuard/P2P is a later fast path, not the MVP
  path.
- The mobile mosh engine uses upstream mosh behavior instead of a clean-room
  Swift reimplementation.
- Swift and mobile UI must not depend on upstream C++ class layout. The stable
  boundary is the C ABI in `native/mosh-core/include/hovvi_mosh_core.h`.
- GPL upstream mosh source is allowed in the repository for native adapter work
  and CI checks, but it must not be silently included in the current MIT npm
  package.
- Relay datagrams carry encrypted mosh packets. The relay must not interpret
  mosh AES-OCB/SSP payloads.
- tmux-native scrollback is separate from the live mosh stream. Mobile scrolling
  must use a proper scrollback model instead of pretending that the live screen
  buffer is complete history.
- iOS is the first mobile quality target. Android follows after iOS attach
  quality stabilizes.

## Current Foundation

- npm package `hovvi@0.1.0` is published.
- GitHub and npm release basics are established.
- CI runs CLI checks, tests, package dry-run, native ABI checks, native adapter
  checks, vendored mosh verification, upstream native smokes, and Swift checks.
- The upstream mosh snapshot is vendored from audited commit
  `decd9b705eb81626f694335b8d5940538beb06da`.
- Vendor verification checks both file set and SHA-256 hashes.
- The native C ABI scaffold is buildable and intentionally returns
  `HOVVI_MOSH_UNAVAILABLE` until an upstream-backed adapter is linked.
- Repository-only upstream C ABI static library builds as
  `native/mosh-core/build/upstream/libhovvi_mosh_core_upstream.a` through
  `npm run native:upstream-lib`.
- Swift has a `MoshCoreEngine` interface that consumes the C ABI shape.
- Swift `CAbiMoshCoreEngine` imports the C ABI through SwiftPM and validates the
  unavailable scaffold/status mapping in `HovviMobileCoreSmoke`.
- Upstream native smokes currently validate:
  - AES-OCB crypto session round trip
  - network fragmentation and reassembly
  - packet encode/decode and timestamp behavior
  - encrypted upstream packet flow through Hovvi relay datagram endpoints
  - upstream-backed ABI create/decrypt/protocol error behavior
  - upstream-backed terminal output and outbound input/resize packet behavior
  - upstream-backed ABI tick scheduling and clean shutdown behavior
- Hovvi-owned in-process packet IO exists in
  `native/mosh-core/adapter/hovvi_packet_io.h`.
- Hovvi-owned relay datagram size/status handling exists in
  `native/mosh-core/adapter/hovvi_relay_datagram.h`.
- Hovvi-owned relay session pumping exists in
  `native/mosh-core/adapter/hovvi_mosh_relay_session.h`.
- Hovvi-owned C ABI driver adaptation exists in
  `native/mosh-core/adapter/hovvi_c_abi_mosh_driver.h`.
- Local macOS mosh-server bootstrap harness exists in `src/mosh-harness.js` and
  `hovvi mosh-harness`. It validates the real `MOSH CONNECT` port/key and opens
  the UDP relay-datagram bridge, but full native frame exchange remains pending.
- Repository-only upstream relay transport instruction slice exists in
  `native/mosh-core/src/hovvi_mosh_relay_transport_upstream.h`. It sends input
  and resize diffs and receives terminal diffs through Hovvi relay datagrams
  using upstream `TransportInstruction` fragmentation.
- Optional local native mosh-server probe exists as
  `npm run native:mosh-server-harness-check`. On Macs with `tmux` and
  `mosh-server`, it binds `mosh-server` to `127.0.0.1`, sends native relay
  transport data to the UDP port, and verifies rendered tmux output, shell
  input, paste-sized input, resize, and shutdown acknowledgement.
- Relay datagram lifecycle cleanup exists through `sweepStaleDatagrams`, with
  tests for peer disconnects and idle timeout pruning. Native upstream transport
  smokes cover out-of-order multi-fragment relay datagram assembly.

## Execution Goals

### 1. Native Relay-Backed Mosh Adapter

Build the first Hovvi-owned adapter layer between upstream mosh network packets
and Hovvi relay datagram endpoints.

Deliverables:

- Adapter source under `native/mosh-core/adapter/`.
- Tests that use in-process datagram queues, not UDP sockets.
- No direct Swift dependency on upstream C++.
- No mutation of vendored upstream mosh files unless a separate ADR justifies it.
- CI target coverage through `npm run native:adapter-check` or
  `npm run native:upstream-check`, depending on whether GPL upstream symbols are
  linked.

Acceptance criteria:

- The adapter preserves mosh packet boundaries.
- Bidirectional client/server packet flow is deterministic in-process.
- Datagram size limits are enforced before relay send.
- Failure paths return explicit status values, not silent drops.
- Tests document the exact upstream classes/functions touched by the adapter.

### 2. Upstream-Backed C ABI Engine

Replace the unavailable scaffold with an upstream-backed implementation behind
`hovvi_mosh_core.h` while keeping the scaffold available for unsupported or
MIT-only builds.

Deliverables:

- Real `hovvi_mosh_core_create`, `receive`, `input`, `resize`, `tick`, and
  `shutdown` paths for upstream-enabled builds.
- Frame output for terminal bytes, outbound relay datagrams, errors, and tick
  scheduling.
- Explicit ownership rules for all buffers returned through the ABI.
- Swift wrapper updates without exposing C++ types.
- Build mode separation between shipped MIT scaffold and repository GPL-linked
  native validation.

Acceptance criteria:

- `tick` drives retransmit, ack, prediction, and shutdown progress.
- `receive` can consume encrypted mosh datagrams from the relay path.
- `input` and `resize` map to upstream mosh semantics.
- Unsupported builds still fail clearly with `HOVVI_MOSH_UNAVAILABLE`.
- ABI smoke tests cover success, unavailable, invalid key, invalid packet, and
  shutdown cases.

### 3. Local macOS Mosh-Server Harness

Prove the native engine against a real local `mosh-server` before connecting it
to mobile UI.

Deliverables:

- A macOS command-line harness that bootstraps local `mosh-server`.
- A deterministic relay/datagram bridge between the harness and the server.
- tmux attach target for a known session.
- Test fixtures for input, output, resize, paste, and clean shutdown.

Acceptance criteria:

- The harness can start `mosh-server`, validate the printable key, and exchange
  encrypted packets.
- A tmux session can be attached through the native path.
- Text output is observed through the native frame API.
- Resize and paste behavior are covered before mobile UI integration.
- Cleanup leaves no orphaned `mosh-server` or tmux test sessions.

### 4. Relay Datagram Integration

Connect the native mosh packet path to the existing Hovvi relay and Mac agent
datagram protocol.

Deliverables:

- Agent-side UDP/datagram bridge hardening for `mosh-server`.
- Mobile/client relay datagram session integration with the native core.
- Strict message validation, size limits, close semantics, heartbeat handling,
  and stale channel cleanup.
- Integration tests for local relay, agent, and client datagram flow.
- Public relay client datagram API coverage exists for real relay + agent + UDP
  round trips.

Acceptance criteria:

- No inbound port forwarding is required on the Mac.
- The relay forwards opaque encrypted datagrams only.
- Invalid datagram messages return structured errors.
- The channel handles reconnect/close cases without leaking relay state.
- A local end-to-end smoke can attach to a server-launched tmux session through
  the relay datagram path.

Current status:

- Relay and agent lifecycle cleanup is covered by unit fixtures.
- Relay + real agent + client datagram flow is covered with a local UDP echo
  target.
- Agent-started attach manifests are covered through real tmux creation,
  `mosh-server` bootstrap, and client datagram channel open/close.
- JavaScript clients expose `prepareMoshDatagramAttach` so manifest selection,
  key validation, and channel opening are one reusable attach contract.
- JavaScript and Swift attach paths reject unsupported attach manifest
  `kind`/`version` values before selecting a mosh relay datagram transport.
- `npm run native:relay-attach-check` runs the repository-only native mosh probe
  through a local UDP shim, JavaScript relay datagram channel, relay, agent UDP
  bridge, and agent-started `mosh-server`.
- `npm run native:relay-process-attach-check` repeats the native attach proof
  through a child `hovvi relay --port 0` process, validating the local relay CLI
  startup contract and process lifecycle used by self-hosted setups.
- Swift mobile core has a `MoshAttachSession` coordinator that flushes mosh core
  frames through relay datagrams with fake-engine smoke coverage.
- Swift mobile core can call the C ABI scaffold through `CAbiMoshCoreEngine`;
  upstream GPL static-library linkage remains separated.
- Swift mobile input uses `TerminalInputCommand` byte encoding for text,
  paste-sized text, Return, Tab, Escape, Ctrl-C, and backspace before sending
  data into the mosh input path.
- Swift mobile terminal text input routes single-line input as text and
  multi-line input as paste through a smoke-tested core helper before UI sends
  bytes to the mosh path.
- Swift mobile paste input tracks terminal bracketed-paste mode (`CSI ? 2004
  h/l`) and wraps multi-line input only when the remote terminal enables it.
- Swift mobile keeps tmux-native scrollback separate from live mosh terminal
  output. The terminal surface composes scrollback rows above live screen rows
  with collision-free IDs instead of appending live escape streams into
  scrollback history.
- Swift mobile terminal surface projection is now public and smoke-tested, so
  scrollback/live row order, row sources, and stable render IDs are validated
  before simulator/device screenshot coverage is added.
- Swift mobile terminal viewport projection now caps immediate SwiftUI render
  input, exposes a deterministic bottom anchor, and reports when older rows are
  truncated above the viewport.
- Swift mobile attach shell fixtures now provide deterministic browsing,
  attached coding-agent, failed reattach, and capped viewport states for future
  simulator/device rendering validation without depending on a live relay.
- Swift mobile bootstrap config now lives in `HovviMobileCore`, records relay
  token source, keeps the local alpha development default explicit, and exposes
  redacted token text for diagnostics before hosted login replaces the bootstrap
  credential path.
- Mac agent session discovery now marks tmux panes running `cmux`, classifies
  those containing sessions as `kind: "cmux"`, and advertises `cmux.sessions`
  only when the optional `cmux` command is installed.
- `hovvi doctor` now reports LaunchAgent service state and keeps relay
  WebSocket reachability and read-only macOS Application Firewall state behind
  `hovvi doctor --network`, with URL credentials redacted in diagnostics.
- `hovvi service logs` redacts relay tokens, URL credentials, bearer tokens, and
  printable mosh keys before printing LaunchAgent log files.
- `hovvi service status` and `hovvi doctor` now surface structured launchd
  lifecycle diagnostics, including state, pid, last exit code, termination
  reason, and throttle interval when available.
- `npm run ios:simulator-preflight` now records whether the host has full Xcode,
  `simctl`, and an available iOS simulator before future screenshot execution.
  The current local environment has Command Line Tools active, so simulator
  screenshot execution remains pending.
- Swift mobile failed states now carry recovery actions that distinguish relay
  reconnect from selected-session reattach. Interrupted attach operations close
  the relay datagram transport best-effort while preserving selected session,
  tmux scrollback, and the last live terminal screen.
- Swift mobile attach errors redact relay URL credentials, relay tokens, bearer
  tokens, and printable mosh keys before reaching SwiftUI.
- Swift mobile resize handling now deduplicates unchanged terminal sizes in the
  core attach model, preventing duplicate mosh resize packets from repeated UI
  geometry callbacks.
- Swift mobile attach now exposes `AttachShellModel.tick(nowMs:)`, and
  `HovviMobileApp` runs a conservative attached-state mosh tick loop using
  `nextTickAfterMs` when available.
- JavaScript relay clients now reject pending list/attach/scrollback/forward and
  datagram operations on unexpected relay disconnect, and later calls fail
  immediately instead of waiting for per-operation timeouts.
- `createReconnectingClient` wraps the low-level relay client with conservative
  reconnect-on-next-operation behavior. It does not silently retry failed
  stateful attach operations.
- Native relay packet exchange is proven locally on Macs with `tmux` and
  `mosh-server`; iOS C ABI linkage and terminal UI quality remain pending before
  the mobile attach milestone can be considered complete.

### 5. iOS Alpha Attach Shell

Build the first usable iOS path after the native mosh engine is proven on macOS.

Deliverables:

- Native Swift app shell for sign-in, device list, session list, and attach.
- UI-facing `AttachShellModel` for device loading, session selection, scrollback
  fetch, attach lifecycle, input, resize, receive, shutdown, and redacted error
  state.
- `MoshCoreEngine` integration through the C ABI.
- `MoshAttachSession` coordinator from manifest datagram session to mosh core
  frames.
- Terminal renderer with live screen, resize, keyboard input, paste, and
  scrollback integration.
- tmux-native scrollback fetch via `session.scrollback.fetch`.
- Session state UI for tmux/cmux/Claude Code/Codex where the agent can detect
  it.

Acceptance criteria:

- A user can sign in, pick a Mac, pick a session, and attach without entering
  hostnames, ports, IP addresses, VPN settings, or SSH tunnel settings.
- Live terminal output and input work over relay datagrams.
- Mobile scroll is smooth and does not corrupt the live terminal screen.
- Session list distinguishes attachable tmux/cmux sessions and detected AI
  coding sessions.
- Recoverable errors are user-facing and actionable without exposing secrets.

Current status:

- `HovviMobileApp` exists as a SwiftUI app entry target that wires
  `HovviAttachShellView` to `AttachShellModel`, local relay bootstrap config,
  attach actions, byte-level terminal input/resize, and conservative receive
  and mosh tick loops.
- `AppBootstrapConfig` parses the local alpha relay URL, token, token source,
  and client id in `HovviMobileCore` with smoke coverage for redaction and
  fallback behavior.
- `AttachShellModel` exists in `HovviMobileCore` as the first native shell state
  coordinator and is covered by `HovviMobileCoreSmoke` with fake relay/core
  attach, input, remote receive, resize, tick, shutdown, mosh key redaction, and
  stale device/session selection validation.
- `HovviMobileUI` exists as a SwiftUI library target with presentational
  device/session/terminal/error views backed by `AttachShellSnapshot`.
- `TerminalScreen` keeps live terminal output separate from tmux scrollback and
  covers basic printable text, CR/LF/backspace, CSI cursor movement, clear
  screen, erase display/line modes, resize, SGR text attributes, 256-color/truecolor
  foreground/background colors, inverse rendering, alternate-screen restore, and
  wide grapheme cursor advancement, scroll-region line-feed behavior,
  reverse-index bounded scrolling, DEC origin mode, cursor line/column
  movement, bracketed paste mode, saved cursor state, line/character
  insert-delete, tab-stop, and erase-character behavior in
  `HovviMobileCoreSmoke`.
- A signed Xcode/iOS bundle target, hosted login bootstrap, and
  simulator/device screenshot execution are still pending.

### 6. Mac Agent and CLI Hardening

Make the Mac-side package reliable enough for repeated local and hosted use.

Deliverables:

- `hovvi doctor` checks for tmux, cmux when available, mosh-server, SSH, relay
  reachability, service state, Git/GitHub identity, and common firewall issues.
- LaunchAgent install/start/status/logs hardening.
- Stable attach manifest schema for mobile clients.
- Session discovery for tmux, cmux, Claude Code, Codex, and plain shell sessions
  where detectable.
- Token-redacted logs and diagnostics.

Acceptance criteria:

- A clean Mac can install the package, run doctor, start the agent, and appear
  in a local relay without manual config editing.
- Agent logs are sufficient to debug common setup issues without leaking tokens
  or mosh keys.
- Attach manifests remain backward-compatible or are versioned explicitly.
- CI and local smoke tests cover manifest generation and failure modes.

Current status:

- `hovvi doctor` checks required tools, optional cmux/AI/Tailscale tools, Git
  identity, LaunchAgent service state, opt-in GitHub auth/SSH, opt-in macOS
  Application Firewall state, and opt-in relay WebSocket reachability.
- `hovvi doctor --network` warns when GitHub CLI and GitHub SSH authenticate as
  different accounts, making account mismatch visible during setup.
- `hovvi service logs` prints redacted LaunchAgent stdout/stderr tails so common
  setup failures can be debugged without exposing relay credentials or mosh
  keys.
- Agent reconnect diagnostics are redacted before launchd writes stderr logs,
  including relay URL credentials, tokens, bearer tokens, and printable
  `MOSH_KEY` values.
- `hovvi service status` summarizes launchd lifecycle fields from
  `launchctl print`, and `hovvi doctor` warns when the LaunchAgent is loaded but
  has unhealthy lifecycle state.
- Attach manifests are explicitly versioned as v1 `mosh-tmux`, and both the
  JavaScript relay client and Swift mobile attach path reject unsupported
  manifest schema values.
- tmux sessions and panes are discovered through tmux format output.
- Claude Code, Codex, Gemini, aider, and cursor-agent panes are marked as AI
  coding panes.
- cmux panes are marked when the pane command is `cmux`, the containing tmux
  session is classified as `cmux`, and the agent advertises `cmux.sessions` only
  when `cmux` is installed.

### 7. Hosted Relay and Account Service

Turn the local relay foundation into a hosted login-based experience.

Deliverables:

- Account/device registration flow.
- GitHub OAuth device registration unless a later ADR replaces it.
- Scoped agent/client credentials.
- Token listing, revocation, expiration, and audit events.
- Hosted relay health, metrics, and structured logs.

Acceptance criteria:

- The user logs in instead of manually copying relay tokens for normal hosted
  use.
- Devices are scoped to an account and can be revoked.
- Audit logs redact tokens and secrets.
- Relay status can be inspected operationally without packet payload access.

### 8. Release and Distribution

Keep releases reproducible and legally/commercially safe.

Deliverables:

- Version bump and changelog for every user-facing npm release after `0.1.0`.
- Git tags for release cuts.
- npm provenance or documented fallback.
- Clear npm package contents that exclude GPL mosh source unless the release
  policy changes.
- Mobile source-availability and license notice plan before distributing an app
  linked with upstream mosh.

Acceptance criteria:

- No new commit is published as npm `0.1.0`.
- `npm pack --dry-run` remains part of release verification.
- GPL-linked native artifacts are not shipped without the license/compliance
  decision gate being closed.
- Release notes call out compatibility, migration, and security-relevant changes.

## Decision Gates

Stop and request an explicit decision before doing any of the following:

- Shipping or packaging a mobile app that links upstream mosh-derived GPL code.
- Including vendored GPL mosh source or GPL-linked binaries in the npm package.
- Modifying vendored upstream mosh files instead of adding a Hovvi-owned adapter
  or wrapper.
- Choosing Flutter/React Native for the first terminal engine implementation.
  The confirmed path is Swift plus a native C/C++ core for iOS.
- Starting Android before iOS relay-backed attach quality is proven.
- Starting WireGuard/P2P before the relay-first attach path works.
- Selecting a paid hosted-relay retention, pricing, or data policy.
- Weakening authentication, token scoping, audit redaction, or mosh key
  validation to make a demo pass.
- Publishing a new npm release without version bump, changelog, and package
  contents review.

## Test Gates

Continue implementation, but do not mark the relevant milestone done until these
tests pass:

- Native adapter milestone: deterministic in-process datagram tests.
- C ABI engine milestone: ABI smoke coverage for success and failure states.
- macOS harness milestone: real local `mosh-server` attach through native frames.
- Relay integration milestone: local relay + agent + client datagram end-to-end
  smoke.
- Relay/native attach milestone: local relay + agent + native mosh client +
  server-launched tmux session smoke.
- iOS alpha milestone: attach, input, resize, paste, scrollback, reconnect, and
  error states on device or simulator as appropriate.
- Release milestone: CI green, package dry-run clean, docs updated, and release
  notes written.

## Later

These are intentionally not on the immediate path:

- Android app.
- WireGuard/P2P fast path with relay fallback.
- Homebrew tap and signed release artifacts.
- Full AI workflow controls such as approve/retry/stop buttons for coding
  agents. The immediate goal is reliable session discovery and attach.

## Traceability

- Architecture decisions live in `docs/adr/`.
- Roadmap execution and verification rules live in
  `docs/execution-harness.md`.
- Mosh integration details live in `docs/mosh-core-integration.md`.
- Relay wire format lives in `docs/protocol.md`.
- Referenced upstream projects and documents live in `docs/references.md`.
- Every new architectural decision should either extend an existing ADR or add a
  new ADR before implementation continues past the decision point.
