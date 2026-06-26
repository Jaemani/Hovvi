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

## Source Groups

- `src/crypto`: keep upstream AES-OCB, printable key, nonce, and packet authentication behavior.
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

1. Create a vendoring script that copies only the audited source groups, license files, and generated protobuf inputs into `native/mosh-core/vendor/mosh`.
2. Build a C++ adapter that maps upstream mosh transport send/recv to `hovvi_mosh_core_*` packet APIs.
3. Add a macOS command-line harness that links the adapter and talks to a real local `mosh-server` through in-process datagram queues.
4. Port the harness to an iOS static library build once macOS correctness tests pass.
5. Add packet loss, reordering, resize, paste, and shutdown tests before connecting the core to the app UI.
