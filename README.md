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
hovvi relay --token dev
hovvi up --relay ws://127.0.0.1:8787 --token dev
hovvi mobile
hovvi service install --relay ws://127.0.0.1:8787 --token dev
hovvi service start
```

## Local Relay Smoke Test

In terminal 1:

```bash
hovvi relay --token dev
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
hovvi service install --relay wss://relay.example.com --token <agent-token> --name "Jaemans Mac"
hovvi service start
hovvi service status
hovvi service logs --stream err --lines 80
```

Remove it:

```bash
hovvi service stop
hovvi service uninstall
```

`hovvi service install --print` prints the plist without writing it.

## Relay Token Registry

Development can use `--token dev`. A hosted relay should use hashed token entries:

```bash
hovvi token generate --role agent
hovvi token generate --role client
```

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
```

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

## Git Account State on This Mac

SSH authentication to GitHub was confirmed as `Jaemani` using `/Users/jaeman/.ssh/id_ed25519`.

GitHub CLI is logged in as `Jaemani`, and repo-local Git author identity is configured as `Jaemani <39300288+Jaemani@users.noreply.github.com>`.

## Docs

Architecture decisions live in `docs/adr/`.
Reference material and upstream projects are tracked in `docs/references.md`.
