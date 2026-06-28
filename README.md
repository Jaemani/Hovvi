# Hovvi

Hovvi catches long-running development sessions on a Mac and makes them resumable from mobile devices.

The first implementation is a Node-based CLI, Mac agent, and managed relay foundation. It focuses on tmux session discovery, AI coding tool detection, Git/GitHub/SSH diagnostics, and a relay path that can carry encrypted SSH streams without opening inbound ports on the Mac.

## Install for Local Development

```bash
npm install
npm link
hovvi doctor --network
```

## Core Commands

```bash
hovvi doctor
hovvi sessions
hovvi attach main
hovvi capture main --lines 2000
hovvi relay --token dev --device-timeout-ms 30000
hovvi up --relay ws://127.0.0.1:8787 --token dev
hovvi mobile
hovvi fetch-scrollback --device <device-id> main --lines 2000
hovvi service install --relay ws://127.0.0.1:8787 --token dev
hovvi service start
hovvi token list --registry ./registry.json
hovvi token revoke --registry ./registry.json --name jaeman-iphone
```

## Local Relay Smoke Test

In terminal 1:

```bash
hovvi relay --token dev --device-timeout-ms 30000
```

In terminal 2:

```bash
hovvi up --relay ws://127.0.0.1:8787 --token dev
```

In terminal 3, forward a local port to SSH on the Mac agent:

```bash
hovvi forward --device <device-id> --local-port 2222 --remote-port 22
ssh -p 2222 localhost
```

This tunnel is not the final mobile terminal UX. It proves the relay and agent can move an encrypted stream without requiring port forwarding, VPN setup, or inbound connectivity to the Mac.

## macOS Agent Service

Install the Mac agent as a LaunchAgent:

```bash
hovvi login --client-id <github-oauth-client-id> --registry ./registry.json --issue-token agent --relay wss://relay.example.com --device-name "Jaemans Mac"
hovvi service install
hovvi service start
hovvi service status
hovvi service logs --stream err --lines 80
hovvi service logs --stream both --lines 80
```

`hovvi service install` uses the private relay URL and agent token saved by
login. You can still override them explicitly with `--relay` and `--token`.
`hovvi service status` and `hovvi doctor` show the LaunchAgent config path and
warn if it differs from the active CLI config.
`hovvi service start` and `hovvi service restart` refuse to load a LaunchAgent
whose plist is missing `HOVVI_CONFIG` or points at a different private config.
They also require the private config to contain the relay URL and agent token
the LaunchAgent will read at runtime.
`hovvi service logs` reports missing or empty LaunchAgent log files with paths
instead of printing nothing, supports `--stream both`, and keeps secrets redacted.

Remove it:

```bash
hovvi service stop
hovvi service uninstall
```

`hovvi service install --print` prints the plist without writing it.

The LaunchAgent plist points at the private Hovvi config file and does not store
relay tokens directly in launchd environment variables.

`hovvi doctor` checks that the private config contains a relay URL and token
before the LaunchAgent is expected to run. Diagnostics redact URL credentials
and report only `token=present`, never the token value.
When Hovvi writes its default `~/.hovvi/config.json`, it repairs the default
`~/.hovvi` directory to owner-only permissions.
It also warns when the private config directory or file has group/world
permissions; run `chmod 700 <config-dir>` and `chmod 600 <config-path>` before
using unattended LaunchAgent startup.

## Relay Token Registry

Development can use `--token dev`. A hosted relay should use hashed token entries:

```bash
hovvi token generate --role agent
hovvi token generate --role client
hovvi account upsert --registry ./registry.json --account github:39300288 --name Jaemani
hovvi device upsert --registry ./registry.json --account github:39300288 --device mac-main --name "Mac Studio" --platform darwin
hovvi login --client-id <github-oauth-client-id> --registry ./registry.json --device mac-main --account-name Jaemani
hovvi login --client-id <github-oauth-client-id> --registry ./registry.json --issue-token client --relay wss://relay.example.com --relay-client ios-main --token-name jaeman-iphone
hovvi login --client-id <github-oauth-client-id> --registry ./registry.json --issue-token agent --relay wss://relay.example.com --token-name jaeman-mac-agent
hovvi token generate --registry ./registry.json --name jaeman-iphone --role client --account github:39300288 --client ios-main
```

When issuing an agent token, `hovvi login` reuses the configured device id or
generates one and registers it, so `--device` is optional for new Mac setup.

Create a registry JSON file:

```json
{
  "tokens": [
    {
      "name": "mac-agent",
      "hash": "sha256:...",
      "roles": ["agent"]
    },
    {
      "name": "mobile-client",
      "hash": "sha256:...",
      "roles": ["client"]
    }
  ]
}
```

Start the relay with:

```bash
hovvi relay --registry ./registry.json
hovvi relay --registry ./registry.json --log ./relay.log.jsonl --audit-log ./relay.audit.jsonl
```

List or revoke registry entries without exposing raw token values:

```bash
hovvi account list --registry ./registry.json
hovvi device list --registry ./registry.json --account github:39300288
hovvi device revoke --registry ./registry.json --account github:39300288 --device mac-main
hovvi token list --registry ./registry.json
hovvi token list --registry ./registry.json --account github:39300288 --role agent --device mac-main --active
hovvi token list --registry ./registry.json --status expired
hovvi token list --registry ./registry.json --status not-before
hovvi token list --registry ./registry.json --client ios-main --json
hovvi token revoke --registry ./registry.json --name jaeman-iphone
```

Registry entries may be scoped and time-bound:

```json
{
  "tokens": [
    {
      "name": "jaeman-mac-agent",
      "hash": "sha256:...",
      "accountId": "acct_1",
      "roles": ["agent"],
      "deviceIds": ["dev_abc"],
      "notBefore": "2026-06-24T00:00:00.000Z",
      "expiresAt": "2026-09-24T00:00:00.000Z"
    },
    {
      "name": "jaeman-iphone",
      "hash": "sha256:...",
      "accountId": "acct_1",
      "roles": ["client"],
      "clientIds": ["ios-main"]
    }
  ]
}
```

Operational defaults:

- stale agents are removed after `--device-timeout-ms` (default `30000`)
- stale sweeps run every `--sweep-interval-ms` (default `5000`)
- WebSocket payloads are capped by `--max-payload-bytes` (default `1048576`)
- `--log ./relay.log.jsonl` writes structured relay lifecycle, auth, routing, and cleanup events without packet payloads
- `--audit-log ./relay.audit.jsonl` writes token/hash-redacted auth or registry operation events to a private JSONL file
- `/healthz` returns basic liveness
- `/statusz` and `/metrics.json` return relay id, uptime inputs, connected agent/client counts, stream counts, and counters

Relay protocol inputs are schema-validated before routing to an agent. Invalid messages return structured `error` envelopes with `code`, `field`, and `message`.

Mobile clients should use `session.scrollback.fetch` for native scrollback instead of reconstructing history from terminal frames.

`prepare-attach` asks the Mac agent to build an attach manifest. When `mosh-server` is available, the agent bootstraps `mosh-server new ... -- tmux attach-session -t <session>` and returns a `mosh` method with `relay-datagram` transport details: `remotePort`, encrypted mosh `key`, and the datagram size target. If bootstrap fails, the manifest still includes SSH relay forwarding and local tmux fallbacks.

The native iOS core can select the available `mosh` relay-datagram transport from an attach manifest, validate the printable mosh server key, open the relay datagram channel, and send/receive encrypted mosh packets with relay sequencing and datagram-size enforcement. The relay datagram layer intentionally does not interpret mosh's AES-OCB/SSP payloads; that remains the compatibility boundary for the mobile terminal engine.

The upstream-mosh-first native core plan is tracked in `docs/mosh-core-integration.md`. Hovvi has a stable C ABI draft in `native/mosh-core/include/hovvi_mosh_core.h`, a Swift `MoshCoreEngine` interface, and audit/vendoring scripts so the app does not depend directly on upstream C++ class layout.

Native ABI smoke checks run with:

```bash
npm run native:check
```

## iOS Simulator Smoke Checks

On hosts with full Xcode and an available iOS simulator, the temporary SwiftPM
app bundle can be built, installed, launched, and screenshotted without a signed
distribution target:

```bash
npm run ios:simulator-preflight
npm run ios:simulator-build-check
npm run ios:simulator-app-bundle-check
npm run ios:simulator-install-check
npm run ios:simulator-launch-check
node scripts/ios-simulator-screenshot-check.js --output=.artifacts/ios/hovvi-ios-screenshot.png --metadata=.artifacts/ios/hovvi-ios-screenshot.json
node scripts/ios-simulator-screenshot-matrix-check.js --output-dir=.artifacts/ios/screenshots --metadata=.artifacts/ios/hovvi-ios-screenshot-matrix.json
```

The screenshot check validates a nonblank PNG and can preserve JSON metadata
with fixture, bundle id, simulator, screenshot path, and parsed image stats. The
matrix check reuses one install to capture browsing, attached coding-agent,
failed attach, and capped viewport shell fixtures.

## Product Direction

- Name: Hovvi
- Pronunciation: hovi
- First user experience: install CLI on Mac, sign in on mobile, pick the Mac, catch tmux/Claude/Codex sessions.
- Connectivity: managed relay first, WireGuard/P2P later.
- Terminal compatibility: mosh semantics are the compatibility target; tmux native scrollback is handled separately from the live stream.

## Release

`hovvi@0.1.0` is published on npm.

```bash
npm install -g hovvi
```

Future releases should be cut from git tags:

```bash
npm version patch
git push --follow-tags
```

The release workflow verifies the tag matches `package.json`, runs checks/tests, performs `npm pack --dry-run`, and publishes with npm provenance. Configure npm Trusted Publishing for `Jaemani/Hovvi` before relying on tag-based release automation.

Do not publish new commits as `0.1.0`; bump the version first.

## Git Account State on This Mac

SSH authentication to GitHub was confirmed as `Jaemani` using `/Users/jaeman/.ssh/id_ed25519`.

GitHub CLI is logged in as `Jaemani`, and repo-local Git author identity is configured as `Jaemani <39300288+Jaemani@users.noreply.github.com>`.

## Docs

Architecture decisions live in `docs/adr/`.
Reference material and upstream projects are tracked in `docs/references.md`.
Relay wire format is documented in `docs/protocol.md`.

Contribution and security expectations are documented in `CONTRIBUTING.md` and `SECURITY.md`.
