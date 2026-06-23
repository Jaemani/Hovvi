import { commandExists, runText } from "./shell.js";

const REQUIRED = ["git", "ssh", "tmux", "mosh", "mosh-server"];
const OPTIONAL = ["gh", "cmux", "claude", "codex", "gemini", "tailscale"];

export async function runDoctor({ network = false } = {}) {
  const items = [];

  for (const command of REQUIRED) {
    items.push(checkCommand(command, true));
  }

  for (const command of OPTIONAL) {
    items.push(checkCommand(command, false));
  }

  items.push(...checkGitIdentity());
  if (network) {
    items.push(checkGithubCli());
    items.push(checkGithubSsh());
  } else {
    items.push({
      name: "github network checks",
      status: "warn",
      message: "Skipped. Run `hovvi doctor --network` to check gh auth and GitHub SSH.",
    });
  }

  return {
    ok: items.every((item) => item.status !== "fail"),
    items,
  };
}

function checkCommand(command, required) {
  if (commandExists(command)) {
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

function checkGitIdentity() {
  const items = [];
  const name = runText("git", ["config", "--get", "user.name"]);
  const email = runText("git", ["config", "--get", "user.email"]);
  const ident = runText("git", ["var", "GIT_AUTHOR_IDENT"]);

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

function checkGithubCli() {
  const result = runText("gh", ["auth", "status", "--hostname", "github.com"], { timeout: 10000 });
  return {
    name: "gh auth",
    status: result.ok ? "pass" : "warn",
    message: result.ok ? "logged in" : "not logged in",
    detail: result.ok ? firstLine(result.text) : "Run `gh auth login --hostname github.com` if GitHub CLI is needed.",
  };
}

function checkGithubSsh() {
  const result = runText("ssh", ["-T", "git@github.com"], { timeout: 10000 });
  const text = result.text;
  const matched = /Hi\s+([^!]+)!/.exec(text);
  return {
    name: "github ssh",
    status: matched ? "pass" : "warn",
    message: matched ? `authenticated as ${matched[1]}` : "could not confirm account",
    detail: text || "No SSH output received.",
  };
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
