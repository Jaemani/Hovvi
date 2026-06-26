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

The first upstream-linked native check is intentionally separate from the shipped scaffold:

```bash
npm run native:upstream-check
```

This target compiles vendored upstream `base64.cc`, `crypto.cc`, and `ocb_internal.cc` with a Hovvi-owned Apple CommonCrypto config shim, then runs an AES-OCB `Crypto::Session` encrypt/decrypt round trip. It proves the snapshot has the crypto implementation needed by the adapter without changing the `HOVVI_MOSH_UNAVAILABLE` scaffold behavior.

## Source Groups

- `src/crypto`: keep upstream AES-OCB, printable key, nonce, and packet authentication behavior. The vendor manifest requires both conditional OCB implementations, `ocb_internal.cc` and `ocb_openssl.cc`, even though Automake exposes them through `OCB_SRCS`.
- `src/network`: preserve SSP transport logic, but replace socket IO with adapter callbacks.
- `src/statesync`: keep user stream and complete terminal state synchronization.
- `src/terminal`: keep terminal parser, framebuffer, display diff, and resize/input semantics.
- `src/protobufs`: generate C++ protobuf outputs reproducibly from `.proto` files.
- `src/util`: reuse only helpers needed by the wrapper; avoid importing irrelevant pty/select code unless required.
- `src/frontend/stmclient.*` and `terminaloverlay.*`: reference for client behavior; split out CLI/termios/select details before mobile use.

## License Notes

Upstream mosh is GPLv3-or-later with an OpenSSL exception and an iOS App Store waiver. The waiver says the mosh copyright holders will not object to otherwise-compliant App Store distribution solely because of the conflict between GPLv3 and Apple App Store terms.

This does not remove GPL obligations. A distributed app that links mosh-derived code still needs corresponding source availability and license text. Hovvi's current npm package remains MIT; the mobile app distribution needs a separate license/compliance decision before shipping a linked upstream mosh core.

## Next Implementation Steps

1. Build a C++ adapter that maps upstream mosh transport send/recv to `hovvi_mosh_core_*` packet APIs.
2. Add a macOS command-line harness that links the adapter and talks to a real local `mosh-server` through in-process datagram queues.
3. Port the harness to an iOS static library build once macOS correctness tests pass.
4. Add packet loss, reordering, resize, paste, and shutdown tests before connecting the core to the app UI.

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
