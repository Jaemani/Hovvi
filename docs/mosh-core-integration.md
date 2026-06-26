# Mosh Core Integration Notes

## Current Upstream Snapshot

- Repository: https://github.com/mobile-shell/mosh
- Audited commit: `decd9b705eb81626f694335b8d5940538beb06da`
- Audit command:

```bash
node scripts/mosh-upstream-audit.js --checkout /tmp/hovvi-mosh-ref --summary
```

Observed summary:

```json
{
  "ok": true,
  "missingFiles": [],
  "commit": "decd9b705eb81626f694335b8d5940538beb06da",
  "coreGroups": [
    { "name": "crypto", "sourceCount": 6, "missing": [] },
    { "name": "network", "sourceCount": 11, "missing": [] },
    { "name": "statesync", "sourceCount": 4, "missing": [] },
    { "name": "terminal", "sourceCount": 20, "missing": [] },
    { "name": "protobufs", "sourceCount": 3, "missing": [] },
    { "name": "util", "sourceCount": 12, "missing": [] },
    { "name": "frontend-client", "sourceCount": 5, "missing": [] }
  ]
}
```

## Referenced Upstream Material

- Mosh repository and README: https://github.com/mobile-shell/mosh
- Mosh paper: https://www.usenix.org/system/files/conference/atc12/atc12-final32.pdf
- iOS waiver: https://github.com/mobile-shell/mosh/blob/master/COPYING.iOS
- OCB grant: https://github.com/mobile-shell/mosh/blob/master/ocb-license.html
- Open issues reviewed for current risk shape: https://github.com/mobile-shell/mosh/issues

## Boundary

Hovvi should not expose upstream C++ classes to Swift directly. The stable boundary is:

- C ABI: `native/mosh-core/include/hovvi_mosh_core.h`
- Swift interface: `MoshCoreEngine`
- Relay datagram session: `MoshRelayDatagramSession`

The native core receives opaque encrypted mosh packets from Hovvi relay datagrams and returns:

- terminal output bytes for the mobile terminal renderer
- outbound encrypted mosh packets to send through the relay datagram channel
- next tick scheduling metadata for mosh retransmit, ack, prediction, and shutdown timers

## Build Scaffold

The current native implementation is an unavailable scaffold, not the real upstream-backed core. It exists to keep the ABI, status values, frame ownership rules, printable key validation, and CI wiring buildable before GPL source is vendored.

```bash
npm run native:check
# equivalent:
make -C native/mosh-core check
```

The smoke binary must return `HOVVI_MOSH_UNAVAILABLE` for a valid create call until the upstream adapter is linked. That failure mode is intentional; it prevents the app from silently pretending that mosh protocol handling exists.

The ABI includes `hovvi_mosh_core_tick` and `MoshCoreFrame.nextTickAfterMs` because upstream mosh's client loop is timer-driven. The real adapter must use this path for retransmit, ack, prediction, and shutdown progress instead of hiding timers in Swift UI code.

## Upstream Compile Smoke

The native checks are intentionally separated by ownership and license boundary:

```bash
npm run native:check
npm run native:adapter-check
npm run native:upstream-check
```

- `native:check` validates the shipped unavailable C ABI scaffold.
- `native:adapter-check` validates Hovvi-owned packet IO and relay datagram primitives that may be included in the MIT npm package.
- `native:upstream-check` compiles vendored GPL upstream source for repository/CI validation only.

The upstream-linked check currently runs five isolated smokes:

- crypto: compiles vendored upstream `base64.cc`, `crypto.cc`, and `ocb_internal.cc` with a Hovvi-owned Apple CommonCrypto config shim, then runs an AES-OCB `Crypto::Session` encrypt/decrypt round trip
- network: generates `transportinstruction.pb.cc/.h` under `build/upstream/generated`, compiles upstream `compressor.cc` and `transportfragment.cc`, then runs a `Network::Fragmenter`/`FragmentAssembly` round trip
- packet: compiles upstream `network.cc` and `timestamp.cc`, then verifies `Network::Packet` serialization, valid port range parsing, and timestamp wraparound math
- relay packet: encrypts upstream `Network::Packet` values with `Crypto::Session`, sends the encrypted datagrams through Hovvi `RelayDatagramEndpoint`, decrypts on the other side, reconstructs `Network::Packet`, and verifies datagram size rejection
- upstream ABI: compiles the repository-only upstream C++ implementation behind `hovvi_mosh_core.h`, creates a core with upstream key/session/terminal state, renders validated server host diffs into terminal output bytes, emits encrypted outbound packets for input and resize, verifies tick/clean-shutdown ABI behavior, and verifies crypto/protocol errors at the ABI boundary
- upstream relay transport: compiles a repository-only relay transport slice
  that wraps upstream `TransportInstruction`, `Fragmenter`,
  `FragmentAssembly`, `UserStream`, and `Terminal::Complete` around Hovvi
  `RelayDatagramEndpoint`, then verifies input, terminal output, resize ack
  state, and crypto-error behavior

The protobuf build uses `pkg-config` for protobuf-lite so abseil transitive libraries track the installed protobuf package. These checks prove the snapshot has the crypto, transport-fragment, and packet pieces needed by the adapter without changing the `HOVVI_MOSH_UNAVAILABLE` scaffold behavior.

`Network::Transport` still owns a socket-backed `Connection` directly. A deterministic relay-backed transport test needs a Hovvi-owned adapter seam before it should instantiate the full upstream transport loop.

The first Hovvi-owned seam is `native/mosh-core/adapter/hovvi_packet_io.h`, a bidirectional in-process datagram queue used to preserve packet boundaries and ordering in future relay-backed tests.

`native/mosh-core/adapter/hovvi_relay_datagram.h` is the first relay-oriented layer above that queue. It wraps a packet endpoint, enforces a maximum datagram size before send, and returns explicit statuses for success, empty receive, disconnected peer, and oversize datagrams.

`native/mosh-core/adapter/hovvi_mosh_relay_session.h` defines the Hovvi-owned session pump between a mosh core driver and a relay datagram endpoint. It drains outbound core packets, pumps inbound datagrams, preserves tick/shutdown frame metadata, and maps core/relay failures into explicit session statuses without linking upstream mosh.

`native/mosh-core/adapter/hovvi_c_abi_mosh_driver.h` adapts the stable C ABI to `MoshCoreDriver`. It copies ABI-owned frame data into C++ vectors, frees ABI frames, maps status values, and can use either the default `hovvi_mosh_core_*` symbols or an injected function table for tests/platform builds.

`src/mosh-harness.js` is the first macOS harness slice. It starts a real local
`mosh-server`, validates the `MOSH CONNECT` UDP port and printable key, opens a
Hovvi UDP relay-datagram bridge to that server, and cleans up the spawned server
and any harness-created tmux session. This proves the binary bootstrap and
datagram boundary, but not yet full native frame attach; the upstream
`Network::Transport` loop still needs a socket-free relay-backed seam.

`native/mosh-core/src/hovvi_mosh_relay_transport_upstream.h` is the first
repository-only relay transport slice above raw packets. It uses upstream mosh
transport instructions and fragmentation over `RelayDatagramEndpoint`, renders
server terminal diffs, and sends user input/resize diffs with state
acknowledgement. It remains outside the npm package until the native/GPL
distribution policy is decided.

`npm run native:mosh-server-harness-check` is the first real local server probe.
It starts `mosh-server` bound to `127.0.0.1`, creates a temporary tmux marker
session, sends native relay transport resize/input/paste-sized input through
UDP, verifies rendered native output, and confirms shutdown acknowledgement. The
check is optional and skips when `tmux` or `mosh-server` is unavailable.

Relay datagram lifecycle coverage now includes idle timeout cleanup and peer
disconnect cleanup through `sweepStaleDatagrams`. Upstream relay transport
coverage includes out-of-order multi-fragment server instructions; incomplete
fragment sets must not render terminal output until assembly completes.

## Source Groups

- `src/crypto`: keep upstream AES-OCB, printable key, nonce, and packet authentication behavior. The vendor manifest requires both conditional OCB implementations, `ocb_internal.cc` and `ocb_openssl.cc`, even though Automake exposes them through `OCB_SRCS`.
- `src/network`: preserve SSP transport logic, but replace socket IO with adapter callbacks.
- `src/statesync`: keep user stream and complete terminal state synchronization.
- `src/terminal`: keep terminal parser, framebuffer, display diff, and resize/input semantics.
- `src/protobufs`: generate C++ protobuf outputs reproducibly from `.proto` files into `build/upstream/generated`; do not write generated files into the vendored source tree.
- `src/util`: reuse only helpers needed by the wrapper; avoid importing irrelevant pty/select code unless required.
- `src/frontend/stmclient.*` and `terminaloverlay.*`: reference for client behavior; split out CLI/termios/select details before mobile use.

## License Notes

Upstream mosh is GPLv3-or-later with an OpenSSL exception and an iOS App Store waiver. The waiver says the mosh copyright holders will not object to otherwise-compliant App Store distribution solely because of the conflict between GPLv3 and Apple App Store terms.

This does not remove GPL obligations. A distributed app that links mosh-derived code still needs corresponding source availability and license text. Hovvi's current npm package remains MIT; the mobile app distribution needs a separate license/compliance decision before shipping a linked upstream mosh core.

## Next Implementation Steps

1. Add relay/agent/client datagram end-to-end coverage before
   connecting the core to the app UI.
2. Add reconnect and local relay process integration coverage around the
   mosh-server probe.
3. Port the harness to an iOS static library build once macOS correctness tests
   pass.

## Vendoring Command

The vendored snapshot in `native/mosh-core/vendor/mosh` is regenerated with:

```bash
node scripts/mosh-vendor.js --checkout /tmp/hovvi-mosh-ref --destination native/mosh-core/vendor/mosh --clean
```

Use `--dry-run` to inspect the file plan without copying. The script copies audited license files, core source groups, protobuf inputs, and STM client boundary files. It intentionally excludes `src/frontend/mosh-client.cc` because the CLI, termios, Unix signal loop, and direct socket path are not the mobile app boundary.

After vendoring, verify the manifest and file hashes:

```bash
npm run mosh:vendor:verify
```

The verification step checks both SHA-256 hashes and the exact vendored file set. Any unlisted source file in the vendor tree fails CI so adapter work cannot silently drift away from the audited snapshot.

The vendored GPL source is tracked in git for adapter development and compliance review, but it is intentionally excluded from the current MIT npm CLI package. The npm artifact includes only the Hovvi-owned native ABI scaffold until the mobile/native distribution license is finalized. `native:upstream-check` is therefore a repository/CI check, not a feature of the published npm package.
