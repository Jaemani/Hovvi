import { platform } from "node:os";
import WebSocket from "ws";
import { getConfig } from "./config.js";
import { redactUrlCredentials } from "./redaction.js";
import { serviceStatus } from "./service.js";
import { commandExists, runText } from "./shell.js";

const REQUIRED = ["git", "ssh", "tmux", "mosh", "mosh-server"];
const OPTIONAL = ["gh", "cmux", "claude", "codex", "gemini", "tailscale"];

export async function runDoctor({
  network = false,
  commandExistsFn = commandExists,
  runTextFn = runText,
  getConfigFn = getConfig,
  platformFn = platform,
  serviceStatusFn = serviceStatus,
  relayReachabilityFn = checkRelayReachability,
} = {}) {
  const items = [];

  for (const command of REQUIRED) {
    items.push(checkCommand(command, true, { commandExistsFn }));
  }

  for (const command of OPTIONAL) {
    items.push(checkCommand(command, false, { commandExistsFn }));
  }

  items.push(...checkGitIdentity({ runTextFn }));
  items.push(checkServiceState({ platformFn, serviceStatusFn }));
  if (network) {
    const config = getConfigFn();
    const relayUrl = process.env.HOVVI_RELAY_URL || config.relay?.url || "ws://127.0.0.1:8787";
    items.push(checkGithubCli({ runTextFn }));
    items.push(checkGithubSsh({ runTextFn }));
    items.push(await relayReachabilityFn(relayUrl));
  } else {
    items.push({
      name: "github network checks",
      status: "warn",
      message: "Skipped. Run `hovvi doctor --network` to check gh auth, GitHub SSH, and relay reachability.",
    });
    items.push({
      name: "relay reachability",
      status: "warn",
      message: "Skipped. Run `hovvi doctor --network` to connect to the configured relay.",
    });
  }

  return {
    ok: items.every((item) => item.status !== "fail"),
    items,
  };
}

function checkCommand(command, required, { commandExistsFn }) {
  if (commandExistsFn(command)) {
    return {
      name: command,
      status: "pass",
      message: "found",
    };
  }
  return {
    name: command,
    status: required ? "fail" : "warn",
    message: required ? "missing" : "not installed",
    detail: installHint(command),
  };
}

function checkGitIdentity({ runTextFn }) {
  const items = [];
  const name = runTextFn("git", ["config", "--get", "user.name"]);
  const email = runTextFn("git", ["config", "--get", "user.email"]);
  const ident = runTextFn("git", ["var", "GIT_AUTHOR_IDENT"]);

  items.push({
    name: "git user.name",
    status: name.ok ? "pass" : "warn",
    message: name.ok ? name.stdout.trim() : "not set",
    detail: name.ok ? undefined : "Set a repo or global identity before the first commit.",
  });

  const emailValue = email.stdout.trim();
  const localHostEmail = /@.*\.local(?:[>\s]|$)/.test(ident.stdout) || /\.local$/.test(emailValue);
  items.push({
    name: "git user.email",
    status: email.ok && !localHostEmail ? "pass" : "warn",
    message: email.ok ? emailValue : "not set",
    detail:
      email.ok && !localHostEmail
        ? undefined
        : "Current commits may be authored with a local host email. Use a GitHub verified or noreply email.",
  });

  return items;
}

function checkServiceState({ platformFn, serviceStatusFn }) {
  if (platformFn() !== "darwin") {
    return {
      name: "launchd service",
      status: "warn",
      message: "not checked",
      detail: "LaunchAgent service state is only available on macOS.",
    };
  }

  try {
    const result = serviceStatusFn({});
    return {
      name: "launchd service",
      status: result.loaded ? "pass" : "warn",
      message: result.loaded ? "loaded" : "not loaded",
      detail: result.loaded ? result.label : `Install with \`hovvi service install\`. ${result.detail || ""}`.trim(),
    };
  } catch (error) {
    return {
      name: "launchd service",
      status: "warn",
      message: "could not inspect service",
      detail: error.message,
    };
  }
}

function checkGithubCli({ runTextFn }) {
  const result = runTextFn("gh", ["auth", "status", "--hostname", "github.com"], { timeout: 10000 });
  return {
    name: "gh auth",
    status: result.ok ? "pass" : "warn",
    message: result.ok ? "logged in" : "not logged in",
    detail: result.ok ? firstLine(result.text) : "Run `gh auth login --hostname github.com` if GitHub CLI is needed.",
  };
}

function checkGithubSsh({ runTextFn }) {
  const result = runTextFn("ssh", ["-T", "git@github.com"], { timeout: 10000 });
  const text = result.text;
  const matched = /Hi\s+([^!]+)!/.exec(text);
  return {
    name: "github ssh",
    status: matched ? "pass" : "warn",
    message: matched ? `authenticated as ${matched[1]}` : "could not confirm account",
    detail: text || "No SSH output received.",
  };
}

export function checkRelayReachability(relayUrl, { WebSocketClass = WebSocket, timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (item) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
      }
      resolve(item);
    };
    const timer = setTimeout(() => {
      finish({
        name: "relay reachability",
        status: "warn",
        message: "timed out",
        detail: `Could not open ${redactUrlCredentials(relayUrl)} within ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    try {
      socket = new WebSocketClass(relayUrl);
      socket.once("open", () => {
        finish({
          name: "relay reachability",
          status: "pass",
          message: "reachable",
          detail: redactUrlCredentials(relayUrl),
        });
      });
      socket.once("error", (error) => {
        finish({
          name: "relay reachability",
          status: "warn",
          message: "unreachable",
          detail: `${redactUrlCredentials(relayUrl)}: ${error.message}`,
        });
      });
    } catch (error) {
      finish({
        name: "relay reachability",
        status: "warn",
        message: "invalid relay URL",
        detail: `${redactUrlCredentials(relayUrl)}: ${error.message}`,
      });
    }
  });
}

function firstLine(text) {
  return text.split(/\r?\n/).find(Boolean);
}

function installHint(command) {
  const hints = {
    tmux: "Install with `brew install tmux`.",
    mosh: "Install with `brew install mosh`.",
    "mosh-server": "Install with `brew install mosh`; this binary is required on the Mac host.",
    git: "Install Xcode Command Line Tools or Git.",
    ssh: "Install OpenSSH.",
    gh: "Install with `brew install gh`.",
    cmux: "Optional. Hovvi will use tmux when cmux is absent.",
    claude: "Optional. Install Claude Code if you want AI session detection.",
    codex: "Optional. Install Codex CLI if you want AI session detection.",
    gemini: "Optional. Install Gemini CLI if you want AI session detection.",
    tailscale: "Optional fallback only. Hovvi relay does not require it.",
  };
  return hints[command];
}
