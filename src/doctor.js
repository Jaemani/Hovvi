import { platform } from "node:os";
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import WebSocket from "ws";
import { configPath, getConfig } from "./config.js";
import { relayCredentialIssue } from "./relay-credentials.js";
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
  configPathFn = configPath,
  platformFn = platform,
  serviceStatusFn = serviceStatus,
  relayReachabilityFn = checkRelayReachability,
} = {}) {
  const items = [];
  const configState = readConfigForDoctor(getConfigFn);

  for (const command of REQUIRED) {
    items.push(checkCommand(command, true, { commandExistsFn }));
  }

  for (const command of OPTIONAL) {
    items.push(checkCommand(command, false, { commandExistsFn }));
  }

  items.push(...checkGitIdentity({ runTextFn }));
  items.push(checkRelayConfig(configState));
  items.push(checkConfigDirectoryMode({ configPathFn }));
  items.push(checkConfigFileMode({ configPathFn }));
  items.push(checkServiceState({ platformFn, serviceStatusFn, configPathFn }));
  if (network) {
    const config = configState.config || {};
    const relayUrl = process.env.HOVVI_RELAY_URL || config.relay?.url || "ws://127.0.0.1:8787";
    const githubCli = checkGithubCli({ runTextFn });
    const githubSsh = checkGithubSsh({ runTextFn });
    items.push(githubCli);
    items.push(githubSsh);
    items.push(checkGithubAccountConsistency({ githubCli, githubSsh }));
    items.push(checkGitGithubIdentityContext({ items, githubCli, githubSsh }));
    items.push(checkFirewallState({ platformFn, runTextFn }));
    items.push(await relayReachabilityFn(relayUrl));
  } else {
    items.push({
      name: "github network checks",
      status: "warn",
      message:
        "Skipped. Run `hovvi doctor --network` to check gh auth, GitHub SSH, firewall state, and relay reachability.",
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

function checkConfigDirectoryMode({ configPathFn, existsFn = existsSync, statFn = statSync }) {
  const path = dirname(configPathFn());
  if (!existsFn(path)) {
    return {
      name: "private config directory",
      status: "warn",
      message: "not found",
      detail: path,
    };
  }

  try {
    const mode = statFn(path).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      return {
        name: "private config directory",
        status: "warn",
        message: "permissions too broad",
        detail: `${path} mode=${formatMode(mode)}. Run \`chmod 700 ${shellQuote(path)}\`.`,
      };
    }
    return {
      name: "private config directory",
      status: "pass",
      message: "private",
      detail: `${path} mode=${formatMode(mode)}`,
    };
  } catch (error) {
    return {
      name: "private config directory",
      status: "warn",
      message: "could not inspect permissions",
      detail: `${path}: ${error.message}`,
    };
  }
}

function checkConfigFileMode({ configPathFn, existsFn = existsSync, statFn = statSync }) {
  const path = configPathFn();
  if (!existsFn(path)) {
    return {
      name: "private config file",
      status: "warn",
      message: "not found",
      detail: path,
    };
  }

  try {
    const mode = statFn(path).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      return {
        name: "private config file",
        status: "warn",
        message: "permissions too broad",
        detail: `${path} mode=${formatMode(mode)}. Run \`chmod 600 ${shellQuote(path)}\`.`,
      };
    }
    return {
      name: "private config file",
      status: "pass",
      message: "private",
      detail: `${path} mode=${formatMode(mode)}`,
    };
  } catch (error) {
    return {
      name: "private config file",
      status: "warn",
      message: "could not inspect permissions",
      detail: `${path}: ${error.message}`,
    };
  }
}

function formatMode(mode) {
  return `0${mode.toString(8).padStart(3, "0")}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
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

function readConfigForDoctor(getConfigFn) {
  try {
    return { config: getConfigFn() || {} };
  } catch (error) {
    return { config: {}, error };
  }
}

function checkRelayConfig({ config, error }) {
  if (error) {
    return {
      name: "relay config",
      status: "warn",
      message: "could not read config",
      detail: error.message,
    };
  }

  const relayUrl = config.relay?.url;
  const relayToken = config.relay?.token;
  const missing = [];
  if (!relayUrl) missing.push("relay URL");
  if (!relayToken) missing.push("relay token");

  if (missing.length === 0) {
    const issue = relayCredentialIssue({ relayUrl, token: relayToken });
    if (issue) {
      return {
        name: "relay config",
        status: "warn",
        message: "invalid",
        detail: issue,
      };
    }
    return {
      name: "relay config",
      status: "pass",
      message: "configured",
      detail: `relay=${redactUrlCredentials(relayUrl)} token=present`,
    };
  }

  return {
    name: "relay config",
    status: "warn",
    message: "incomplete",
    detail: `Missing ${missing.join(" and ")} in private config. Run \`hovvi login --relay <url> --issue-token agent\` or \`hovvi service install --relay <url> --token <agent-token>\` before starting the LaunchAgent.`,
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

function checkServiceState({ platformFn, serviceStatusFn, configPathFn }) {
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
    const activeConfigPath = configPathFn();
    const serviceDetail = formatLaunchdServiceDetail(result);
    const unhealthy = result.loaded && result.launchctl?.healthy === false;
    const configMismatch =
      result.configPath &&
      activeConfigPath &&
      result.configPath !== activeConfigPath;
    return {
      name: "launchd service",
      status: result.loaded && !unhealthy && !configMismatch ? "pass" : "warn",
      message: result.loaded
        ? unhealthy
          ? "loaded but unhealthy"
          : configMismatch
            ? "loaded with different config"
            : "loaded"
        : "not loaded",
      detail: result.loaded
        ? serviceDetail || formatLaunchdConfigDetail(result) || result.label
        : `Install with \`hovvi service install\`. ${result.detail || ""}`.trim(),
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

function formatLaunchdServiceDetail(result) {
  const parts = [result.label].filter(Boolean);
  if (result.configPath) parts.push(`config=${result.configPath}`);
  if (result.launchctl?.state) parts.push(`state=${result.launchctl.state}`);
  if (Number.isInteger(result.launchctl?.pid)) parts.push(`pid=${result.launchctl.pid}`);
  if (Number.isInteger(result.launchctl?.lastExitCode)) parts.push(`lastExitCode=${result.launchctl.lastExitCode}`);
  if (result.launchctl?.lastTerminationReason) {
    parts.push(`lastTerminationReason=${result.launchctl.lastTerminationReason}`);
  }
  if (Number.isInteger(result.launchctl?.throttleInterval)) {
    parts.push(`throttleInterval=${result.launchctl.throttleInterval}s`);
  }
  return parts.join(" ");
}

function formatLaunchdConfigDetail(result) {
  return result.configPath ? `${result.label} config=${result.configPath}` : undefined;
}

function checkFirewallState({ platformFn, runTextFn }) {
  if (platformFn() !== "darwin") {
    return {
      name: "macOS firewall",
      status: "warn",
      message: "not checked",
      detail: "macOS Application Firewall state is only available on macOS.",
    };
  }

  const result = runTextFn(
    "/usr/libexec/ApplicationFirewall/socketfilterfw",
    ["--getglobalstate"],
    { timeout: 10000 },
  );
  const text = result.text || result.stdout || result.stderr || "";
  if (!result.ok) {
    return {
      name: "macOS firewall",
      status: "warn",
      message: "could not inspect firewall",
      detail: firstLine(text) || "socketfilterfw did not return firewall state.",
    };
  }

  if (/enabled/i.test(text)) {
    return {
      name: "macOS firewall",
      status: "warn",
      message: "enabled",
      detail:
        "Hovvi relay attach does not require inbound internet ports, but local mosh-server UDP on 127.0.0.1 may be blocked by strict firewall policy.",
    };
  }

  if (/disabled/i.test(text)) {
    return {
      name: "macOS firewall",
      status: "pass",
      message: "disabled",
      detail: firstLine(text),
    };
  }

  return {
    name: "macOS firewall",
    status: "warn",
    message: "unknown",
    detail: firstLine(text) || "socketfilterfw returned an unrecognized firewall state.",
  };
}

function checkGithubCli({ runTextFn }) {
  const result = runTextFn("gh", ["auth", "status", "--hostname", "github.com"], { timeout: 10000 });
  const account = parseGithubCliAccount(result.text);
  return {
    name: "gh auth",
    status: result.ok ? "pass" : "warn",
    message: result.ok ? "logged in" : "not logged in",
    detail: result.ok ? firstLine(result.text) : "Run `gh auth login --hostname github.com` if GitHub CLI is needed.",
    account,
  };
}

function checkGithubSsh({ runTextFn }) {
  const result = runTextFn("ssh", ["-T", "git@github.com"], { timeout: 10000 });
  const text = result.text;
  const account = parseGithubSshAccount(text);
  return {
    name: "github ssh",
    status: account ? "pass" : "warn",
    message: account ? `authenticated as ${account}` : "could not confirm account",
    detail: text || "No SSH output received.",
    account,
  };
}

function checkGithubAccountConsistency({ githubCli, githubSsh }) {
  if (githubCli.account && githubSsh.account) {
    const same = githubCli.account.toLowerCase() === githubSsh.account.toLowerCase();
    return {
      name: "github account consistency",
      status: same ? "pass" : "warn",
      message: same ? `matched as ${githubCli.account}` : "gh and SSH accounts differ",
      detail: same ? undefined : `gh=${githubCli.account} ssh=${githubSsh.account}`,
    };
  }

  return {
    name: "github account consistency",
    status: "warn",
    message: "could not compare accounts",
    detail: "Run `hovvi doctor --network` after both `gh auth status` and `ssh -T git@github.com` can confirm accounts.",
  };
}

function checkGitGithubIdentityContext({ items, githubCli, githubSsh }) {
  const gitName = items.find((item) => item.name === "git user.name");
  const gitEmail = items.find((item) => item.name === "git user.email");
  const githubAccount = githubCli.account || githubSsh.account;
  if (!gitName?.message || gitName.message === "not set") {
    return {
      name: "git/github identity context",
      status: "warn",
      message: "git author name not set",
      detail:
        "Git commit author identity is separate from GitHub login. Set git user.name before relying on Hovvi setup diagnostics.",
    };
  }

  if (!githubAccount) {
    return {
      name: "git/github identity context",
      status: "warn",
      message: "github account unknown",
      detail:
        "Git commit author identity is separate from GitHub login. Run `hovvi doctor --network` after gh or SSH auth can confirm the GitHub account.",
    };
  }

  const gitEmailText =
    gitEmail?.message && gitEmail.message !== "not set" ? ` <${gitEmail.message}>` : "";
  const gitNameLooksLikeDifferentGithubLogin =
    looksLikeGithubLogin(gitName.message) &&
    gitName.message.toLowerCase() !== githubAccount.toLowerCase();
  return {
    name: "git/github identity context",
    status: gitNameLooksLikeDifferentGithubLogin ? "warn" : "pass",
    message: gitNameLooksLikeDifferentGithubLogin
      ? "git author name differs from GitHub login"
      : "identity roles clear",
    detail: gitNameLooksLikeDifferentGithubLogin
      ? `Git commits are authored as ${gitName.message}${gitEmailText}, while GitHub auth is ${githubAccount}. This may be intentional; git user.name is not required to match the GitHub login.`
      : `Git commits are authored as ${gitName.message}${gitEmailText}; GitHub operations authenticate as ${githubAccount}. These identities are separate and do not need to match.`,
  };
}

function looksLikeGithubLogin(value = "") {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
}

function parseGithubCliAccount(text = "") {
  return (
    /Logged in to github\.com account\s+([^\s]+)/i.exec(text)?.[1] ||
    /Logged in to github\.com as\s+([^\s]+)/i.exec(text)?.[1]
  );
}

function parseGithubSshAccount(text = "") {
  return /Hi\s+([^!]+)!/.exec(text)?.[1]?.trim();
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
