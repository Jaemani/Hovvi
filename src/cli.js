import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { getConfig, saveConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { runGithubDeviceLogin } from "./github-auth.js";
import { runAgent } from "./agent.js";
import { runRelay } from "./relay.js";
import {
  DEFAULT_LABEL,
  installService,
  readServiceLogs,
  restartService,
  formatServiceStatus,
  serviceStatus,
  startService,
  stopService,
  uninstallService,
} from "./service.js";
import {
  attachTmux,
  captureTmuxScrollback,
  ensureTmuxSession,
  listSessions,
} from "./sessions.js";
import { readFlag, readOption, splitFlags } from "./flags.js";
import { createClient } from "./relay-client.js";
import { randomId } from "./protocol.js";
import {
  hashToken,
  listRegistryAccounts,
  listRegistryDevices,
  listRegistryTokens,
  loadRegistry,
  revokeRegistryToken,
  saveRegistry,
  upsertRegistryAccount,
  upsertRegistryDevice,
} from "./registry.js";
import { localMoshHarnessPreflight, runLocalMoshServerHarness } from "./mosh-harness.js";

const HELP = `Hovvi

Usage:
  hovvi doctor [--json] [--network]
  hovvi login [--client-id <github-oauth-client-id>]
  hovvi relay [--host 127.0.0.1] [--port 8787] [--token <token>] [--registry <path>] [--audit-log <path>]
  hovvi up [--relay ws://127.0.0.1:8787] [--token <token>] [--name <device-name>] [--heartbeat-ms 10000]
  hovvi sessions [--json]
  hovvi attach [session-name]
  hovvi capture [session-name] [--lines 2000]
  hovvi mobile [--relay wss://relay.example.com]
  hovvi devices [--relay ws://127.0.0.1:8787] [--json]
  hovvi prepare-attach --device <device-id> [session-name] [--json] [--create]
  hovvi mosh-harness [session-name] [--json] [--no-create] [--timeout-ms 5000] [--max-datagram-bytes 1200]
  hovvi fetch-scrollback --device <device-id> [session-name] [--lines 2000] [--json]
  hovvi forward --device <device-id> [--local-port 2222] [--remote-host 127.0.0.1] [--remote-port 22]
  hovvi service <install|start|stop|restart|status|logs|uninstall> [--relay <url>] [--token <token>]
  hovvi account <upsert|list> --registry <path> [--account <account-id>] [--name <name>] [--json]
  hovvi device <upsert|list> --registry <path> [--account <account-id>] [--device <device-id>] [--name <name>] [--platform <platform>] [--json]
  hovvi token <generate|hash|list|revoke> [token] [--role agent|client|*] [--account <account-id>] [--device <device-id>] [--client <client-id>] [--registry <path>]

Commands:
  doctor    Check git, GitHub, SSH, tmux, mosh, and AI coding tools.
  login     Run GitHub OAuth device login when HOVVI_GITHUB_CLIENT_ID is set.
  relay     Start the managed relay service for development/self-hosting.
  up        Start the Mac agent and publish tmux/AI session metadata to relay.
  sessions  List local tmux sessions and detected AI coding panes.
  attach    Attach to an existing tmux session, creating one when missing.
  capture   Print tmux scrollback for mobile-style native scroll testing.
  mobile    Print pairing and mobile-client instructions.
  devices   List devices currently connected to the relay.
  prepare-attach
            Ask a connected agent for a mobile attach manifest.
  mosh-harness
            Run a local mosh-server bootstrap and UDP relay-datagram harness smoke.
  fetch-scrollback
            Fetch tmux scrollback from a connected agent.
  forward   Open a local TCP tunnel through relay to a registered agent.
  service   Install and manage the macOS launchd agent.
  account   Register or list relay accounts in a private registry file.
  device    Register or list account-scoped devices in a private registry file.
  token     Generate or hash relay access tokens for registry files.
`;

export async function main(argv) {
  const [command = "help", ...rest] = argv;

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(HELP);
      return;
    case "version":
    case "--version":
    case "-v":
      process.stdout.write("0.1.0\n");
      return;
    case "doctor":
      return doctorCommand(rest);
    case "login":
      return loginCommand(rest);
    case "relay":
      return relayCommand(rest);
    case "up":
    case "agent":
    case "start":
      return upCommand(rest);
    case "sessions":
      return sessionsCommand(rest);
    case "attach":
      return attachCommand(rest);
    case "capture":
      return captureCommand(rest);
    case "mobile":
      return mobileCommand(rest);
    case "devices":
      return devicesCommand(rest);
    case "prepare-attach":
      return prepareAttachCommand(rest);
    case "mosh-harness":
      return moshHarnessCommand(rest);
    case "fetch-scrollback":
      return fetchScrollbackCommand(rest);
    case "forward":
      return forwardCommand(rest);
    case "service":
      return serviceCommand(rest);
    case "account":
      return accountCommand(rest);
    case "device":
      return deviceCommand(rest);
    case "token":
      return tokenCommand(rest);
    case "init":
      return initCommand(rest);
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

async function doctorCommand(args) {
  const json = readFlag(args, "--json");
  const create = readFlag(args, "--create");
  const network = readFlag(args, "--network");
  const report = await runDoctor({ network });

  if (json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  for (const item of report.items) {
    const label = item.status.toUpperCase().padEnd(4, " ");
    process.stdout.write(`${label} ${item.name}: ${item.message}\n`);
    if (item.detail) process.stdout.write(`     ${item.detail}\n`);
  }
  process.stdout.write(`\n${report.ok ? "Hovvi doctor passed." : "Hovvi doctor found issues."}\n`);
}

async function loginCommand(args) {
  const clientId =
    readOption(args, "--client-id") ||
    process.env.HOVVI_GITHUB_CLIENT_ID ||
    getConfig().githubClientId;

  if (!clientId) {
    throw new Error(
      "GitHub OAuth client id is required. Set HOVVI_GITHUB_CLIENT_ID or pass --client-id.",
    );
  }

  const login = await runGithubDeviceLogin({
    clientId,
    onUserCode: ({ verificationUri, userCode }) => {
      process.stdout.write(`Open ${verificationUri} and enter code: ${userCode}\n`);
    },
  });

  const config = getConfig();
  config.githubClientId = clientId;
  config.github = {
    login: login.user.login,
    id: login.user.id,
    token: login.accessToken,
  };
  saveConfig(config);
  process.stdout.write(`Logged in as ${login.user.login}.\n`);
}

async function relayCommand(args) {
  const config = getConfig();
  const host = readOption(args, "--host") || process.env.HOVVI_RELAY_HOST || "127.0.0.1";
  const port = Number(readOption(args, "--port") || process.env.HOVVI_RELAY_PORT || 8787);
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const registryPath = readOption(args, "--registry") || process.env.HOVVI_RELAY_REGISTRY;
  const auditLogPath = readOption(args, "--audit-log") || process.env.HOVVI_AUDIT_LOG;
  const deviceTimeoutMs = Number(readOption(args, "--device-timeout-ms") || process.env.HOVVI_DEVICE_TIMEOUT_MS || 30000);
  const sweepIntervalMs = Number(readOption(args, "--sweep-interval-ms") || process.env.HOVVI_SWEEP_INTERVAL_MS || 5000);
  const maxPayloadBytes = Number(readOption(args, "--max-payload-bytes") || process.env.HOVVI_MAX_PAYLOAD_BYTES || 1024 * 1024);
  await runRelay({ host, port, token, registryPath, auditLogPath, deviceTimeoutMs, sweepIntervalMs, maxPayloadBytes });
}

async function upCommand(args) {
  const config = getConfig();
  const relayUrl =
    readOption(args, "--relay") ||
    process.env.HOVVI_RELAY_URL ||
    config.relay?.url ||
    "ws://127.0.0.1:8787";
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const name = readOption(args, "--name") || process.env.HOVVI_DEVICE_NAME || config.device?.name;
  const heartbeatIntervalMs = Number(readOption(args, "--heartbeat-ms") || process.env.HOVVI_HEARTBEAT_MS || 10000);
  const publishIntervalMs = Number(readOption(args, "--publish-ms") || process.env.HOVVI_PUBLISH_MS || 5000);
  await runAgent({ relayUrl, token, name, heartbeatIntervalMs, publishIntervalMs });
}

async function sessionsCommand(args) {
  const json = readFlag(args, "--json");
  const sessions = await listSessions();
  if (json) {
    process.stdout.write(`${JSON.stringify({ sessions }, null, 2)}\n`);
    return;
  }
  if (sessions.length === 0) {
    process.stdout.write("No tmux sessions found.\n");
    return;
  }
  for (const session of sessions) {
    const ai = session.aiPanes.map((pane) => pane.command).join(", ") || "none";
    process.stdout.write(`${session.name} (${session.windows} windows, attached=${session.attached}, ai=${ai})\n`);
  }
}

async function attachCommand(args) {
  const [sessionName = "main"] = args;
  await ensureTmuxSession(sessionName);
  await attachTmux(sessionName);
}

async function captureCommand(args) {
  const lines = Number(readOption(args, "--lines") || 2000);
  const [sessionName = "main"] = args;
  const text = await captureTmuxScrollback(sessionName, lines);
  process.stdout.write(text);
  if (!text.endsWith("\n")) process.stdout.write("\n");
}

async function mobileCommand(args) {
  const config = getConfig();
  const relayUrl = readOption(args, "--relay") || process.env.HOVVI_RELAY_URL || "wss://relay.hovvi.dev";
  const login = config.github?.login || "<login with hovvi login first>";
  const text = `Hovvi mobile setup

1. Install the Hovvi mobile app.
2. Sign in with GitHub as ${login}.
3. Keep the Mac agent running:

   hovvi up --relay ${relayUrl}

4. The app should show this Mac and its tmux/AI sessions automatically.

Fallback while the native mobile client is in alpha:

   hovvi sessions
   hovvi attach main

Mosh compatibility target:

   mosh <user>@<hovvi-device> -- tmux attach -t main
`;
  process.stdout.write(text);
}

async function devicesCommand(args) {
  const config = getConfig();
  const json = readFlag(args, "--json");
  const relayUrl =
    readOption(args, "--relay") ||
    process.env.HOVVI_RELAY_URL ||
    config.relay?.url ||
    "ws://127.0.0.1:8787";
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const client = await createClient({ relayUrl, token });
  const devices = await client.listDevices();
  client.close();
  if (json) {
    process.stdout.write(`${JSON.stringify({ devices }, null, 2)}\n`);
    return;
  }
  if (devices.length === 0) {
    process.stdout.write("No devices connected.\n");
    return;
  }
  for (const device of devices) {
    const sessions = device.sessions?.length ?? 0;
    process.stdout.write(`${device.id} ${device.name || "<unnamed>"} (${sessions} sessions)\n`);
  }
}

async function prepareAttachCommand(args) {
  const config = getConfig();
  const json = readFlag(args, "--json");
  const create = readFlag(args, "--create");
  const deviceId = readOption(args, "--device");
  if (!deviceId) throw new Error("prepare-attach requires --device <device-id>.");
  const lines = Number(readOption(args, "--lines") || 2000);
  const relayUrl =
    readOption(args, "--relay") ||
    process.env.HOVVI_RELAY_URL ||
    config.relay?.url ||
    "ws://127.0.0.1:8787";
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const [sessionName = "main"] = args;
  const client = await createClient({ relayUrl, token });
  let manifest;
  try {
    manifest = await client.prepareAttach({ deviceId, sessionName, lines, create });
  } finally {
    client.close();
  }
  if (json) {
    process.stdout.write(`${JSON.stringify({ manifest }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${manifest.kind} ${manifest.deviceName || manifest.deviceId}:${manifest.sessionName}\n`);
  for (const method of manifest.methods) {
    process.stdout.write(`${method.name} (${method.status}): ${method.command.join(" ")}\n`);
  }
}

async function moshHarnessCommand(args) {
  const json = readFlag(args, "--json");
  const create = !readFlag(args, "--no-create");
  const timeoutMs = Number(readOption(args, "--timeout-ms") || 5000);
  const maxDatagramBytes = Number(readOption(args, "--max-datagram-bytes") || 1200);
  const [sessionName = "hovvi-harness"] = args;
  const preflight = localMoshHarnessPreflight();
  if (!preflight.ok) {
    throw new Error(`Missing harness dependencies: ${preflight.missing.join(", ")}`);
  }

  const result = await runLocalMoshServerHarness({ sessionName, create, timeoutMs, maxDatagramBytes });
  try {
    const printable = {
      ok: result.ok,
      sessionName: result.sessionName,
      createdSession: result.createdSession,
      mosh: result.mosh,
      datagram: result.datagram,
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(printable, null, 2)}\n`);
      return;
    }
    process.stdout.write(`mosh-server ready on 127.0.0.1:${result.mosh.port}\n`);
    process.stdout.write(`printable key validated for ${result.sessionName}\n`);
    process.stdout.write(`relay datagram bridge ready, maxDatagramBytes=${result.datagram.maxDatagramBytes}\n`);
  } finally {
    await result.dispose();
  }
}

async function fetchScrollbackCommand(args) {
  const config = getConfig();
  const json = readFlag(args, "--json");
  const deviceId = readOption(args, "--device");
  if (!deviceId) throw new Error("fetch-scrollback requires --device <device-id>.");
  const lines = Number(readOption(args, "--lines") || 2000);
  const relayUrl =
    readOption(args, "--relay") ||
    process.env.HOVVI_RELAY_URL ||
    config.relay?.url ||
    "ws://127.0.0.1:8787";
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const [sessionName = "main"] = args;
  const client = await createClient({ relayUrl, token });
  let result;
  try {
    result = await client.fetchScrollback({ deviceId, sessionName, lines });
  } finally {
    client.close();
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(result.text);
  if (!result.text.endsWith("\n")) process.stdout.write("\n");
}

async function initCommand(args) {
  await doctorCommand(args);
  process.stdout.write("\nNext: run `hovvi relay` in one shell and `hovvi up` in another for local relay testing.\n");
}

async function serviceCommand(args) {
  const [action = "status"] = args;
  const config = getConfig();
  const relayUrl =
    readOption(args, "--relay") ||
    process.env.HOVVI_RELAY_URL ||
    config.relay?.url ||
    "ws://127.0.0.1:8787";
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const name = readOption(args, "--name") || process.env.HOVVI_DEVICE_NAME || config.device?.name;
  const label = readOption(args, "--label") || config.service?.label || DEFAULT_LABEL;

  switch (action) {
    case "install": {
      const print = readFlag(args, "--print");
      if (!print) {
        config.relay = { ...(config.relay || {}), url: relayUrl, token };
        config.service = { ...(config.service || {}), label };
        if (name) config.device = { ...(config.device || {}), name };
        saveConfig(config);
      }
      const result = installService({ relayUrl, token, name, label, print });
      process.stdout.write(print ? result.plist : `Installed ${result.label} at ${result.plistPath}\n`);
      if (!print) process.stdout.write("Run `hovvi service start` to load it.\n");
      return;
    }
    case "start": {
      const result = startService({ label });
      process.stdout.write(`Started ${result.label}\n`);
      return;
    }
    case "stop": {
      stopService({ label });
      process.stdout.write(`Stopped ${label}\n`);
      return;
    }
    case "restart": {
      const result = restartService({ label });
      process.stdout.write(`Restarted ${result.label}\n`);
      return;
    }
    case "status": {
      const result = serviceStatus({ label });
      process.stdout.write(`${result.loaded ? "loaded" : "not loaded"} ${label}\n`);
      const summary = formatServiceStatus(result);
      if (summary) process.stdout.write(`${summary}\n`);
      if (!result.loaded && result.detail) process.stdout.write(`${result.detail}\n`);
      return;
    }
    case "logs": {
      const stream = readOption(args, "--stream") || "err";
      const lines = Number(readOption(args, "--lines") || 80);
      process.stdout.write(readServiceLogs({ stream, lines }));
      return;
    }
    case "uninstall": {
      const result = uninstallService({ label });
      process.stdout.write(`Uninstalled ${result.label} from ${result.plistPath}\n`);
      return;
    }
    default:
      throw new Error(`Unknown service action: ${action}`);
  }
}

async function accountCommand(args) {
  const [action = "list"] = args;
  const registryPath = readOption(args, "--registry") || process.env.HOVVI_RELAY_REGISTRY;
  const json = readFlag(args, "--json");
  if (!registryPath) throw new Error("Usage: hovvi account <upsert|list> --registry <path>");

  switch (action) {
    case "upsert": {
      const accountId = readOption(args, "--account");
      if (!accountId) throw new Error("account upsert requires --account <account-id>");
      const name = readOption(args, "--name");
      const registry = loadRegistry(registryPath);
      const account = upsertRegistryAccount(registry, { accountId, name });
      saveRegistry(registryPath, registry);
      if (json) {
        process.stdout.write(`${JSON.stringify({ account }, null, 2)}\n`);
        return;
      }
      process.stdout.write(`Registered account ${account.accountId}`);
      if (account.name) process.stdout.write(` name=${account.name}`);
      process.stdout.write("\n");
      return;
    }
    case "list": {
      const accounts = listRegistryAccounts(loadRegistry(registryPath));
      if (json) {
        process.stdout.write(`${JSON.stringify({ accounts }, null, 2)}\n`);
        return;
      }
      if (accounts.length === 0) {
        process.stdout.write("No registry accounts found.\n");
        return;
      }
      for (const account of accounts) {
        process.stdout.write(`${account.accountId}`);
        if (account.name) process.stdout.write(` name=${account.name}`);
        if (account.updatedAt) process.stdout.write(` updated=${account.updatedAt}`);
        process.stdout.write("\n");
      }
      return;
    }
    default:
      throw new Error(`Unknown account action: ${action}`);
  }
}

async function deviceCommand(args) {
  const [action = "list"] = args;
  const registryPath = readOption(args, "--registry") || process.env.HOVVI_RELAY_REGISTRY;
  const json = readFlag(args, "--json");
  if (!registryPath) throw new Error("Usage: hovvi device <upsert|list> --registry <path>");

  switch (action) {
    case "upsert": {
      const accountId = readOption(args, "--account");
      const deviceId = readOption(args, "--device");
      if (!accountId) throw new Error("device upsert requires --account <account-id>");
      if (!deviceId) throw new Error("device upsert requires --device <device-id>");
      const name = readOption(args, "--name");
      const platform = readOption(args, "--platform");
      const registry = loadRegistry(registryPath);
      const device = upsertRegistryDevice(registry, { accountId, deviceId, name, platform });
      saveRegistry(registryPath, registry);
      if (json) {
        process.stdout.write(`${JSON.stringify({ device }, null, 2)}\n`);
        return;
      }
      process.stdout.write(`Registered device ${device.deviceId} account=${device.accountId}`);
      if (device.name) process.stdout.write(` name=${device.name}`);
      if (device.platform) process.stdout.write(` platform=${device.platform}`);
      process.stdout.write("\n");
      return;
    }
    case "list": {
      const accountId = readOption(args, "--account");
      const devices = listRegistryDevices(loadRegistry(registryPath), { accountId });
      if (json) {
        process.stdout.write(`${JSON.stringify({ devices }, null, 2)}\n`);
        return;
      }
      if (devices.length === 0) {
        process.stdout.write("No registry devices found.\n");
        return;
      }
      for (const device of devices) {
        process.stdout.write(`${device.deviceId} account=${device.accountId}`);
        if (device.name) process.stdout.write(` name=${device.name}`);
        if (device.platform) process.stdout.write(` platform=${device.platform}`);
        if (device.updatedAt) process.stdout.write(` updated=${device.updatedAt}`);
        process.stdout.write("\n");
      }
      return;
    }
    default:
      throw new Error(`Unknown device action: ${action}`);
  }
}

async function tokenCommand(args) {
  const [action = "generate"] = args;
  const role = readOption(args, "--role") || "*";
  const registryPath = readOption(args, "--registry") || process.env.HOVVI_RELAY_REGISTRY;
  const json = readFlag(args, "--json");

  switch (action) {
    case "generate": {
      const token = `hovvi_${randomId()}${randomId()}`;
      const entry = tokenRegistryEntry({ token, role, args });
      appendTokenRegistryEntry({ registryPath, entry });
      process.stdout.write(`${JSON.stringify({ token, registryEntry: entry }, null, 2)}\n`);
      return;
    }
    case "hash": {
      const token = args[1];
      if (!token) throw new Error("Usage: hovvi token hash <token> [--role agent|client|*] [--account <account-id>]");
      const entry = tokenRegistryEntry({ token, role, args });
      appendTokenRegistryEntry({ registryPath, entry });
      process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`);
      return;
    }
    case "list": {
      if (!registryPath) throw new Error("Usage: hovvi token list --registry <path> [--json]");
      const tokens = listRegistryTokens(loadRegistry(registryPath));
      if (json) {
        process.stdout.write(`${JSON.stringify({ tokens }, null, 2)}\n`);
        return;
      }
      if (tokens.length === 0) {
        process.stdout.write("No registry tokens found.\n");
        return;
      }
      for (const token of tokens) {
        const status = token.disabled ? "disabled" : "active";
        const roles = token.roles.join(",");
        const constraints = [
          token.accountId ? `account=${token.accountId}` : null,
          token.deviceIds?.length ? `devices=${token.deviceIds.join(",")}` : null,
          token.clientIds?.length ? `clients=${token.clientIds.join(",")}` : null,
          token.notBefore ? `notBefore=${token.notBefore}` : null,
          token.expiresAt ? `expires=${token.expiresAt}` : null,
        ].filter(Boolean);
        process.stdout.write(`${token.name || "<unnamed>"} ${status} roles=${roles}`);
        if (constraints.length > 0) process.stdout.write(` ${constraints.join(" ")}`);
        process.stdout.write("\n");
      }
      return;
    }
    case "revoke": {
      if (!registryPath) throw new Error("Usage: hovvi token revoke --registry <path> --name <token-name>");
      const name = readOption(args, "--name");
      const hash = readOption(args, "--hash");
      if (!name && !hash) throw new Error("token revoke requires --name <token-name> or --hash sha256:...");
      const registry = loadRegistry(registryPath);
      const revoked = revokeRegistryToken(registry, { name, hash });
      if (!revoked) throw new Error("No matching registry token found.");
      saveRegistry(registryPath, registry);
      process.stdout.write(`Revoked ${revoked.name || revoked.hash}\n`);
      return;
    }
    default:
      throw new Error(`Unknown token action: ${action}`);
  }
}

function tokenRegistryEntry({ token, role, args }) {
  const name = readOption(args, "--name") || `token-${Date.now()}`;
  const accountId = readOption(args, "--account");
  const deviceIds = readRepeatedCsvOptions(args, "--device");
  const clientIds = readRepeatedCsvOptions(args, "--client");
  const notBefore = readOption(args, "--not-before");
  const expiresAt = readOption(args, "--expires-at");
  return {
    name,
    ...(accountId ? { accountId } : {}),
    hash: hashToken(token),
    roles: [role],
    ...(deviceIds.length > 0 ? { deviceIds } : {}),
    ...(clientIds.length > 0 ? { clientIds } : {}),
    ...(notBefore ? { notBefore } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function appendTokenRegistryEntry({ registryPath, entry }) {
  if (!registryPath) return;
  const registry = loadRegistry(registryPath);
  registry.tokens = Array.isArray(registry.tokens) ? registry.tokens : [];
  if (registry.tokens.some((token) => token.name === entry.name)) {
    throw new Error(`Registry token already exists: ${entry.name}`);
  }
  registry.tokens.push(entry);
  saveRegistry(registryPath, registry);
}

function readRepeatedCsvOptions(args, option) {
  const values = [];
  for (;;) {
    const value = readOption(args, option);
    if (!value) break;
    values.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(values)];
}

async function forwardCommand(args) {
  const deviceId = readOption(args, "--device");
  if (!deviceId) throw new Error("forward requires --device <device-id>.");
  const localPort = Number(readOption(args, "--local-port") || 2222);
  const remoteHost = readOption(args, "--remote-host") || "127.0.0.1";
  const remotePort = Number(readOption(args, "--remote-port") || 22);
  const relayUrl = readOption(args, "--relay") || process.env.HOVVI_RELAY_URL || "ws://127.0.0.1:8787";
  const token = readOption(args, "--token") || process.env.HOVVI_RELAY_TOKEN || "dev";

  const client = await createClient({ relayUrl, token });
  const server = createServer((socket) => {
    client
      .openForward({ deviceId, remoteHost, remotePort })
      .then((stream) => {
        socket.pipe(stream).pipe(socket);
      })
      .catch((error) => {
        socket.destroy(error);
      });
  });
  server.listen(localPort, "127.0.0.1", () => {
    process.stdout.write(
      `Forwarding 127.0.0.1:${localPort} -> ${deviceId}:${remoteHost}:${remotePort} through ${relayUrl}\n`,
    );
  });
}

export function spawnInherit(command, args) {
  const child = spawn(command, args, { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} exited with signal ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

export { splitFlags };
