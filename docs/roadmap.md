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
- `npm run package:boundary-check` inspects the actual `npm pack --dry-run`
  file list and rejects vendored mosh source, native build artifacts, Swift
  build artifacts, and GPL-linked upstream C ABI implementation files.
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
- JavaScript relay datagram clients now enforce `maxDatagramBytes` before
  serializing or sending `datagram.data`, matching the Swift mobile fail-fast
  packet-size contract.
- The relay server now enforces each channel's `maxDatagramBytes` against
  inbound `datagram.data` from either peer, returning structured errors and
  releasing channel state instead of forwarding oversized payloads.
- Swift mobile relay datagram sessions now also enforce `maxDatagramBytes` on
  inbound `datagram.data` before packets reach the mosh engine, clearing and
  best-effort closing the channel on oversized payloads.
- The Mac agent now treats relay `datagram.error` the same as `datagram.close`
  for local bridge cleanup, and the UDP bridge closes itself after local
  oversize rejection so relay-side channel teardown cannot leave an agent-local
  datagram bridge behind.
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
- `npm run ios:upstream-cabi-link-check` now builds the repository-only upstream
  C ABI static library and links a temporary Swift binary against it, proving
  Swift can import and call the upstream-backed C ABI without changing the
  shipped MIT SwiftPM scaffold or packaging GPL-linked artifacts.
- Swift mobile input uses `TerminalInputCommand` byte encoding for text,
  paste-sized text, Return, Tab, Escape, Ctrl-C, backspace, ANSI arrow keys,
  Home, End, Page Up, Page Down, and forward Delete before sending data into the
  mosh input path.
- Swift mobile terminal state tracks DEC application cursor-key mode
  (`CSI ? 1 h/l`) and uses it to switch toolbar arrow keys between normal CSI
  and SS3 application cursor-key bytes.
- Swift mobile terminal state tracks DEC autowrap mode (`CSI ? 7 h/l`), keeping
  default wrapping behavior while allowing fixed-width programs to write the
  right edge without forcing a line feed.
- Swift mobile terminal parsing now supports RIS (`ESC c`) to reset live screen
  state, modes, attributes, character set, tab stops, scroll region, saved
  cursor, and alternate-screen snapshot state without mutating tmux-native
  scrollback.
- Swift mobile terminal parsing now supports explicit scroll up/down sequences
  (`CSI S/T`) against the active scroll region or full live screen.
- Swift mobile terminal parsing now supports cursor movement aliases (`CSI a`,
  `CSI e`, and `CSI d`) with the same origin-mode bounds as existing movement.
- Swift mobile terminal parsing now supports cursor tabulation (`CSI I/Z`)
  against the same default/custom tab-stop model used by horizontal tabs.
- Swift mobile terminal text input routes single-line input as text and
  multi-line input as paste through a smoke-tested core helper before UI sends
  bytes to the mosh path.
- Swift mobile paste input tracks terminal bracketed-paste mode (`CSI ? 2004
  h/l`) and wraps multi-line input only when the remote terminal enables it.
- Swift mobile keeps tmux-native scrollback separate from live mosh terminal
  output. The terminal surface composes scrollback rows above live screen rows
  with collision-free IDs instead of appending live escape streams into
  scrollback history.
- Swift mobile can refresh tmux-native scrollback for the selected session while
  attached, replacing only the scrollback buffer and preserving the live mosh
  terminal screen, attach session, and recoverable error state.
- Swift mobile terminal surface projection is now public and smoke-tested, so
  scrollback/live row order, row sources, and stable render IDs are validated
  before simulator/device screenshot coverage is added.
- Swift mobile terminal viewport projection now caps immediate SwiftUI render
  input, exposes a deterministic bottom anchor, and reports when older rows are
  truncated above the viewport.
- Swift mobile terminal resize now derives mosh terminal dimensions from the
  terminal surface geometry only, not the entire detail view including input
  controls, through a smoke-tested `TerminalGeometry` projection.
- Swift mobile terminal rows now render in a horizontal+vertical scroll surface
  with no row wrapping and a smoke-tested minimum surface width derived from the
  active terminal column count.
- Swift mobile terminal auto-follow now has an explicit UI gate, so users can
  hold scrollback without each new live row forcing the surface back to bottom.
- Swift mobile session rows now use a tested `SessionPresentation` projection so
  tmux, cmux, AI coding sessions, attached state, window counts, and detected
  Claude Code/Codex/Gemini/aider/Cursor Agent panes render through stable UI
  metadata instead of ad hoc row strings.
- Swift mobile attach shell fixtures now provide deterministic browsing,
  attached coding-agent, failed reattach, and capped viewport states for
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
- iOS simulator preflight now retries transient `simctl list` failures before
  declaring the simulator unavailable, keeping CI screenshot evidence
  fail-closed without treating temporary CoreSimulator restarts as final.
- `HovviMobileApp` now supports deterministic screenshot fixtures through
  `HOVVI_IOS_SNAPSHOT_FIXTURE`, so future simulator/device screenshot gates can
  render attached, browsing, and failed states without requiring a live relay.
- `npm run ios:simulator-build-check` now reuses the simulator preflight and, on
  full-Xcode hosts, verifies that the SwiftPM `HovviMobileApp` scheme compiles
  for an iOS simulator and produces a build artifact before screenshot
  execution is attempted.
- `npm run ios:simulator-app-bundle-check` now wraps the simulator executable
  artifact in a temporary `HovviMobileApp.app` bundle with a minimal simulator
  `Info.plist`, giving screenshot automation an installable-bundle shape without
  crossing the signed mobile distribution gate.
- `npm run ios:simulator-install-check` now boots the selected simulator on
  full-Xcode hosts and installs the temporary simulator bundle with `simctl`,
  proving the bundle is accepted by CoreSimulator before screenshot execution.
  It now uses bounded `simctl list devices --json` polling instead of blocking
  `bootstatus -b`, and retries one stalled boot by shutdown/reboot so
  hosted-runner CoreSimulator startup flake remains visible but recoverable.
  Each `simctl` boot/list/shutdown/install operation also has an internal
  timeout below the CI step timeout, so Hovvi returns structured diagnostics
  before GitHub Actions kills a stalled install gate.
- CI now places explicit timeouts around each simulator gate and the shared
  shell runner uses `SIGKILL` for timed-out child processes, so CoreSimulator
  hangs become bounded failures instead of job-level stalls.
- `npm run ios:simulator-launch-check` now reuses an already installed simulator
  app before falling back to install-then-launch, so the CI launch gate proves
  CoreSimulator can execute the deterministic attached coding-agent fixture
  without adding a redundant rebuild after the install gate. Launch and
  screenshot capture commands use internal `simctl` timeouts and explicit
  timeout diagnostics, so matrix failures identify the stalled operation before
  the CI step timeout is reached.
- `npm run ios:simulator-screenshot-check` now launches the deterministic
  attached coding-agent fixture, captures a CoreSimulator PNG screenshot, and
  validates that the image is well-formed and nonblank before later golden
  visual assertions. CI preserves the captured PNG and machine-readable
  screenshot metadata as artifacts when the simulator gate runs on full Xcode.
- `npm run ios:simulator-screenshot-matrix-check` now reuses one simulator
  install to capture deterministic browsing, attached coding-agent, and failed
  attach fixture PNGs, preserving the PNG set and metadata artifact in CI.
- The simulator screenshot matrix now records PNG byte length and SHA-256
  metadata and rejects duplicate fixture images, so fixture selector regressions
  are caught before exact golden baselines exist.
- The simulator screenshot matrix now records pixel variation counts and ratios,
  rejecting low-variation images that are technically nonblank but too flat to
  prove meaningful UI rendering.
- The simulator screenshot matrix metadata now carries a versioned artifact
  summary with expected fixture coverage, per-fixture PNG hashes, nonblank
  status, minimum image quality bounds, and distinct-image invariants so CI
  artifacts can be audited without re-running CoreSimulator.
- The simulator screenshot matrix artifact is now schema version 2 and records
  semantic fixture expectations (`role`, `state`, and `requiredSignals`) so CI
  artifacts show which mobile attach state each deterministic screenshot is
  intended to prove.
- Screenshot fixture expectations now live in
  `docs/ios-screenshot-fixtures.json`, and Swift smoke reads the same contract
  to verify each deterministic preview snapshot exposes the required semantic
  signals before simulator screenshots can be treated as meaningful attach-shell
  evidence.
- Simulator screenshot matrix artifacts now include the fixture contract schema
  version, SHA-256, and fixture count, and the verifier rejects stale contract
  metadata so CI screenshot evidence can be traced back to the exact semantic
  fixture contract that produced it.
- CI runs the screenshot matrix with `--require-captured`, so a missing
  CoreSimulator screenshot artifact fails CI instead of silently passing as a
  skipped local smoke.
- The simulator screenshot matrix retries transient `xcodebuild is not usable`
  preflight skips once before honoring `--require-captured`, because preceding
  simulator build/install/launch gates can prove Xcode availability in the same
  CI job.
- Swift mobile `AttachShellSnapshot` now carries an optional terminal viewport
  render cap, and the deterministic `capped-viewport` fixture applies it with
  cap-specific live rows and visible session metadata so simulator screenshots
  can exercise mobile-sized terminal windows without mutating tmux scrollback or
  live screen state.
- Swift mobile failed states now carry recovery actions that distinguish relay
  reconnect from selected-session reattach. Interrupted attach operations close
  the relay datagram transport best-effort while preserving selected session,
  tmux scrollback, and the last live terminal screen.
- Swift mobile recovery labels and retry routing now share a tested
  `AttachShellRecoveryPolicy`, keeping relay reconnect and selected-session
  reattach behavior from drifting between UI and app controller code.
- Swift mobile attach now treats core-reported clean shutdown frames as terminal
  lifecycle completion: final output is preserved, the relay datagram transport
  is closed, the active mosh session is cleared, and the shell returns to
  browsing.
- Swift mobile attach errors redact relay URL credentials, relay tokens, bearer
  tokens, and printable mosh keys before reaching SwiftUI.
- Swift mobile reconnect and explicit reattach now close any stale relay datagram
  transport and clear the stale mosh session before starting a new browsing or
  attach lifecycle.
- Swift mobile device/session selection now closes stale relay datagram
  transports when changing the attached target, while re-selecting the current
  attached session remains a no-op.
- Swift mobile attach startup failures now close relay datagram transports that
  were opened before native mosh engine startup or initial packet flush failed,
  preventing failed attach attempts from leaking relay channel state.
- Swift mobile mosh relay datagram sessions now treat relay `datagram.error` as
  terminal for the active channel, clear the connected channel id, preserve the
  relay error for UI recovery, and reject later stale sends immediately.
- Swift mobile attach now treats relay `datagram.close` without a core clean
  shutdown frame as a recoverable terminal interruption, clears the active mosh
  session, preserves selected device/session, scrollback, and live terminal
  state, and routes retry to selected-session reattach.
- Swift mobile attach model now preserves terminal viewport render caps across
  connect, selection, attach, input, clean shutdown, and recoverable failure
  transitions without trimming tmux-native scrollback or mutating live terminal
  state.
- Swift mobile resize handling now deduplicates unchanged terminal sizes in the
  core attach model, preventing duplicate mosh resize packets from repeated UI
  geometry callbacks.
- Swift mobile attach now exposes `AttachShellModel.tick(nowMs:)`, and
  `HovviMobileApp` runs a conservative attached-state mosh tick loop using
  `nextTickAfterMs` when available.
- Swift mobile foreground lifecycle now resumes receive and tick loops for an
  attached session after background pause, with a smoke-tested lifecycle policy
  and duplicate receive-loop guard.
- Swift mobile attach receive/tick loops now use a generation guard before
  publishing snapshots and clear the receive task handle on exit, preventing
  stale loop results from overwriting reconnect, retry, or reattach state.
- Swift mobile receive-loop snapshots now cancel the tick loop immediately when
  they move the shell out of the attached phase, preventing sleeping tick tasks
  from surviving clean shutdown or recoverable terminal failure transitions.
- Swift mobile terminal parsing now skips OSC title/integration sequences
  terminated by BEL or ST, including when split across receive frames, preventing
  common shell/tmux metadata from corrupting live terminal text.
- Swift mobile terminal parsing now consumes ASCII and DEC special graphics G0
  character set designations, preventing stray charset control bytes and mapping
  common tmux/ncurses line drawing to Unicode box characters.
- Swift mobile terminal state now tracks DEC cursor visibility mode
  (`CSI ? 25 h/l`) separately from terminal text so future cursor rendering does
  not corrupt scrollback or line content.
- Swift mobile terminal projection now exposes the visible live cursor as
  separate row metadata and renders it as an overlay, leaving tmux scrollback and
  terminal text runs unchanged. Blank live screens still project rows after live
  terminal bytes arrive, so a cleared terminal can show the insertion point
  while pre-live attach keeps the scrollback-only fallback.
- JavaScript relay clients now reject pending list/attach/scrollback/forward and
  datagram operations on unexpected relay disconnect, and later calls fail
  immediately instead of waiting for per-operation timeouts.
- `createReconnectingClient` wraps the low-level relay client with conservative
  reconnect-on-next-operation behavior. It does not silently retry failed
  stateful attach operations.
- Native relay packet exchange and repository-only Swift upstream C ABI linkage
  are proven locally on Macs with `tmux` and `mosh-server`; terminal UI quality
  and simulator/device execution remain pending before the mobile attach
  milestone can be considered complete.

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
- `HovviMobileApp` now guards async user actions with a generation check so
  stale connect, selection, attach, input, resize, or scrollback refresh results
  cannot overwrite newer UI state after a later exclusive action starts.
- Swift mobile attach snapshots now enforce attached-only mosh tick scheduling:
  browsing, failed, explicit shutdown, and remote clean-shutdown states clear
  stale `nextTickAfterMs` while preserving terminal screen, scrollback,
  selection, and recovery context.
- `AppBootstrapConfig` parses the local alpha relay URL, token, token source,
  and client id in `HovviMobileCore` with smoke coverage for redaction and
  fallback behavior.
- `AppBootstrapConfig` now validates iOS alpha relay bootstrap input before
  network use: relay URLs must be absolute `ws`/`wss` URLs with a host, and the
  development fallback token is allowed only for local relays. Non-local relays
  require an explicit relay token until hosted mobile login replaces the
  bootstrap boundary.
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
  reverse-index bounded scrolling, explicit scroll up/down, DEC origin mode, DEC autowrap mode,
  cursor line/column
  movement, bracketed paste mode, application cursor-key mode, OSC skipping,
  DEC special graphics character
  mapping, cursor visibility state and UI projection, RIS reset, saved cursor state, line/character
  insert-delete, explicit cursor movement aliases, tab-stop, cursor tabulation, and erase-character behavior in
  `HovviMobileCoreSmoke`.
- A signed Xcode/iOS bundle target, hosted login bootstrap, device screenshot
  execution, and exact golden visual baselines are still pending. Simulator
  screenshot smoke execution now covers browsing, attached coding-agent, failed
  attach, and capped viewport SwiftPM bundle fixtures with semantic fixture
  contract validation, duplicate image detection, and image-quality bounds.

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
- `hovvi doctor --network` also explains the relationship between local Git
  author identity and the GitHub account used by gh/SSH, warning only when the
  Git author name looks like a different GitHub-style login instead of treating
  real-name commit authors as account mismatches.
- `hovvi service logs` prints redacted LaunchAgent stdout/stderr tails so common
  setup failures can be debugged without exposing relay credentials or mosh
  keys.
- Agent reconnect diagnostics are redacted before launchd writes stderr logs,
  including relay URL credentials, tokens, bearer tokens, and printable
  `MOSH_KEY` values.
- `hovvi service status` summarizes launchd lifecycle fields from
  `launchctl print`, and `hovvi doctor` warns when the LaunchAgent is loaded but
  has unhealthy lifecycle state.
- LaunchAgent plists now reference the private Hovvi config file only and avoid
  duplicating relay tokens in launchd environment variables.
- `hovvi doctor` now checks that the private Hovvi config contains the relay URL
  and token needed by config-only LaunchAgent startup, while redacting URL
  credentials and never printing token values.
- `hovvi doctor` now warns when the private Hovvi config directory or file has
  group/world permissions, keeping persisted relay tokens auditable without
  printing them.
- `saveConfig` repairs the default `~/.hovvi` directory to owner-only
  permissions when writing persisted relay credentials, while leaving custom
  `HOVVI_CONFIG` parent directories under operator control.
- `hovvi service install` now requires a relay URL and agent token from flags,
  environment, or private config instead of silently installing a LaunchAgent
  with local development defaults. The generated plist points at the same
  private config path the CLI read.
- `hovvi service status` and `hovvi doctor` now surface the LaunchAgent
  `HOVVI_CONFIG` path and warn when the loaded service points at a different
  config file than the active CLI invocation.
- `hovvi service start` and `hovvi service restart` now refuse to load
  LaunchAgent plists that are missing `HOVVI_CONFIG` or point at a different
  private config path than the active CLI invocation.
- `hovvi service start` and `hovvi service restart` now also require the active
  private config to contain the relay URL and agent token that the LaunchAgent
  will read at runtime.
- Mac-side relay credentials now share a fail-closed validation boundary:
  relay URLs must be absolute `ws://` or `wss://` URLs with a host, and the
  development `dev` token is accepted only for loopback relays. `hovvi doctor`
  reports invalid relay config with credentials redacted before service start or
  client attach commands can use it.
- A config-only service rehearsal now covers the clean Mac path without launchd
  side effects: private config supplies relay URL, token, and device identity;
  `hovvi service install --print` emits a plist containing only `HOVVI_CONFIG`;
  `hovvi doctor` validates the same private config, service config path, file
  permissions, and token redaction; agent runtime resolves from config with no
  flags; and a local relay client can see the configured device and
  deterministic tmux session.
- `hovvi service logs` now reports missing and empty LaunchAgent logs with file
  paths, supports `--stream both`, and keeps relay tokens, URL credentials,
  bearer tokens, and printable mosh keys redacted.
- `hovvi service status --json` now emits deterministic structured LaunchAgent
  lifecycle fields without raw `launchctl` detail text, keeping machine
  diagnostics stable and avoiding accidental credential exposure.
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

Current status:

- Registry tokens can carry an `accountId`, and relay clients with scoped
  account tokens only see and operate on agents authenticated to the same
  account. Cross-account attach, forward, and datagram requests return the same
  offline-style error as missing devices to avoid leaking device existence.
- `hovvi token generate` and `hovvi token hash` can now create account-scoped,
  device-scoped, client-scoped, and time-bounded registry entries directly when
  `--registry` is provided, while list output still omits raw hashes.
- The registry has account and device upsert primitives with private file
  persistence preserved for future hosted registration workflows.
- Relay accepted-auth audit events include the authenticated registry
  `accountId` while continuing to omit raw relay tokens and token hashes.
- `hovvi account upsert/list` and `hovvi device upsert/list` expose the
  account/device registry flow for hosted-relay rehearsals without hand-editing
  private registry JSON.
- `hovvi login --registry` can register the GitHub OAuth user as
  `github:<user-id>` and optionally register a device record, connecting the
  local OAuth login path to the account/device registry shape.
- `hovvi login --registry --issue-token agent|client` can issue an
  account-scoped relay token into the private registry and save the raw token
  only in the private local config, reducing manual token copying during
  hosted-relay rehearsals.
- `hovvi login --relay <url>` can now save the relay URL into private config
  during the same login/token issuance flow, with URL credentials redacted in
  stdout.
- `hovvi login --registry --issue-token agent` no longer requires a manually
  chosen `--device`; it reuses the configured device id or generates one, then
  scopes the agent token and registry device record to that id.
- `hovvi device revoke` disables a registry device, and account-scoped agent
  authentication rejects revoked device records before an agent can appear
  online.
- Registry management commands can write token/hash-redacted audit events for
  token generation, token hashing, token revocation, account upsert, device
  upsert, and device revocation through `--audit-log`.
- `hovvi token list` can filter registry output by account, role, device,
  client, and active/disabled state while still omitting raw token hashes.
- `hovvi token list` now reports lifecycle status values for active, disabled,
  expired, not-yet-valid, and invalid-dated registry tokens, and can filter them
  with `--status` without exposing raw token hashes.
- `hovvi relay --log` writes structured JSONL lifecycle, auth, routing, and
  cleanup events without raw relay tokens, token hashes, or packet payloads.

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
