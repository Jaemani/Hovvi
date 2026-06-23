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

## Product Direction

- Name: Hovvi
- Pronunciation: hovi
- First user experience: install CLI on Mac, sign in on mobile, pick the Mac, catch tmux/Claude/Codex sessions.
- Connectivity: managed relay first, WireGuard/P2P later.
- Terminal compatibility: mosh semantics are the compatibility target; tmux native scrollback is handled separately from the live stream.

## Git Account State on This Mac

SSH authentication to GitHub was confirmed as `Jaemani` using `/Users/jaeman/.ssh/id_ed25519`.

Known local gaps:

- `gh` is not logged in.
- Git author identity currently falls back to a local host email unless `user.email` is configured.

Before the first public commit:

```bash
gh auth login --hostname github.com
git config user.name "Jaemani"
git config user.email "<GitHub verified or noreply email>"
```

## Docs

Architecture decisions live in `docs/adr/`.
