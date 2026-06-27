import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, platform, userInfo } from "node:os";
import { fileURLToPath } from "node:url";
import { redactSecrets } from "./redaction.js";
import { runText } from "./shell.js";

export const DEFAULT_LABEL = "dev.hovvi.agent";

export function installService({
  relayUrl,
  token,
  name,
  label = DEFAULT_LABEL,
  configPath,
  binPath,
  print = false,
}) {
  assertMacos();
  const plistPath = servicePlistPath(label);
  const logsDir = join(homedir(), ".hovvi", "logs");
  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(logsDir, { recursive: true });

  const plist = buildLaunchAgentPlist({
    label,
    nodePath: process.execPath,
    binPath: binPath || defaultBinPath(),
    configPath: configPath || join(homedir(), ".hovvi", "config.json"),
    relayUrl,
    token,
    name,
    stdoutPath: join(logsDir, "agent.out.log"),
    stderrPath: join(logsDir, "agent.err.log"),
  });

  if (!print) writeFileSync(plistPath, plist, { mode: 0o600 });
  return { label, plistPath, plist };
}

export function uninstallService({ label = DEFAULT_LABEL }) {
  assertMacos();
  const stopped = stopService({ label, allowFailure: true });
  const plistPath = servicePlistPath(label);
  if (existsSync(plistPath)) unlinkSync(plistPath);
  return { label, plistPath, stopped };
}

export function startService({ label = DEFAULT_LABEL, activeConfigPath } = {}) {
  assertMacos();
  const { plistPath } = assertServiceCanStart({ label, activeConfigPath });
  const guiTarget = launchTarget(label);
  let result = runText("launchctl", ["bootstrap", guiTarget.domain, plistPath], { timeout: 10000 });
  if (!result.ok && /already bootstrapped|service already loaded/i.test(result.text)) {
    result = runText("launchctl", ["kickstart", "-k", guiTarget.service], { timeout: 10000 });
  }
  if (!result.ok) throw new Error(result.text || "launchctl bootstrap failed");
  return { label, plistPath, message: result.text };
}

export function stopService({ label = DEFAULT_LABEL, allowFailure = false } = {}) {
  assertMacos();
  const guiTarget = launchTarget(label);
  const result = runText("launchctl", ["bootout", guiTarget.domain, servicePlistPath(label)], {
    timeout: 10000,
  });
  if (!result.ok && !allowFailure && !/No such process|Input\/output error/i.test(result.text)) {
    throw new Error(result.text || "launchctl bootout failed");
  }
  return { label, message: result.text };
}

export function restartService({ label = DEFAULT_LABEL, activeConfigPath } = {}) {
  assertMacos();
  assertServiceCanStart({ label, activeConfigPath });
  stopService({ label, allowFailure: true });
  return startService({ label, activeConfigPath });
}

export function serviceStatus({ label = DEFAULT_LABEL }) {
  assertMacos();
  const guiTarget = launchTarget(label);
  const result = runText("launchctl", ["print", guiTarget.service], { timeout: 10000 });
  const plistPath = servicePlistPath(label);
  const launchctl = parseLaunchctlPrint(result.text);
  return {
    label,
    loaded: result.ok,
    plistPath,
    configPath: readLaunchAgentConfigPath(plistPath),
    detail: result.text,
    launchctl,
  };
}

export function servicePlistPath(label = DEFAULT_LABEL) {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

export function buildLaunchAgentPlist({
  label,
  nodePath,
  binPath,
  configPath,
  stdoutPath,
  stderrPath,
}) {
  const env = {
    HOVVI_CONFIG: configPath,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(nodePath)}</string>
    <string>${xml(binPath)}</string>
    <string>up</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env)
  .map(([key, value]) => `    <key>${xml(key)}</key>\n    <string>${xml(value || "")}</string>`)
  .join("\n")}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderrPath)}</string>
  <key>WorkingDirectory</key>
  <string>${xml(homedir())}</string>
</dict>
</plist>
`;
}

export function readLaunchAgentConfigPath(plistPath) {
  if (!plistPath || !existsSync(plistPath)) return undefined;
  return parseLaunchAgentConfigPath(readFileSync(plistPath, "utf8"));
}

export function assertServiceCanStart({ label = DEFAULT_LABEL, activeConfigPath } = {}) {
  const plistPath = servicePlistPath(label);
  if (!existsSync(plistPath)) {
    throw new Error(`LaunchAgent plist not found: ${plistPath}`);
  }
  validateLaunchAgentConfigPath({
    activeConfigPath,
    launchAgentConfigPath: readLaunchAgentConfigPath(plistPath),
    plistPath,
  });
  return { label, plistPath };
}

export function parseLaunchAgentConfigPath(plist = "") {
  const match = /<key>HOVVI_CONFIG<\/key>\s*<string>([^<]*)<\/string>/m.exec(plist);
  return match ? xmlUnescape(match[1]) : undefined;
}

export function validateLaunchAgentConfigPath({
  activeConfigPath,
  launchAgentConfigPath,
  plistPath,
} = {}) {
  if (!activeConfigPath) return;
  if (!launchAgentConfigPath) {
    throw new Error(
      `LaunchAgent plist is missing HOVVI_CONFIG. Reinstall with \`hovvi service install\`: ${plistPath}`,
    );
  }
  if (launchAgentConfigPath !== activeConfigPath) {
    throw new Error(
      `LaunchAgent plist uses a different HOVVI_CONFIG (${launchAgentConfigPath}). Reinstall with \`hovvi service install\` from this config (${activeConfigPath}).`,
    );
  }
}

export function readServiceLogs({ stream = "err", lines = 80 } = {}) {
  const path = join(homedir(), ".hovvi", "logs", stream === "out" ? "agent.out.log" : "agent.err.log");
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  return redactSecrets(text.split(/\r?\n/).slice(-lines).join("\n"));
}

export function parseLaunchctlPrint(text = "") {
  const state = matchValue(text, /^state = (.+)$/m);
  const pid = matchInteger(text, /^pid = (-?\d+)$/m);
  const lastExitCode = matchInteger(text, /^last exit code = (-?\d+)$/m);
  const lastTerminationReason = matchValue(text, /^last termination reason = (.+)$/m);
  const throttleInterval = matchInteger(text, /^throttle interval = (-?\d+)$/m);

  return {
    state,
    pid,
    lastExitCode,
    lastTerminationReason,
    throttleInterval,
    healthy: isHealthyLaunchctlState({ state, lastExitCode }),
  };
}

export function formatServiceStatus(status) {
  const parts = [];
  if (status.configPath) parts.push(`config=${status.configPath}`);
  if (status.launchctl?.state) parts.push(`state=${status.launchctl.state}`);
  if (Number.isInteger(status.launchctl?.pid)) parts.push(`pid=${status.launchctl.pid}`);
  if (Number.isInteger(status.launchctl?.lastExitCode)) {
    parts.push(`lastExitCode=${status.launchctl.lastExitCode}`);
  }
  if (status.launchctl?.lastTerminationReason) {
    parts.push(`lastTerminationReason=${status.launchctl.lastTerminationReason}`);
  }
  if (Number.isInteger(status.launchctl?.throttleInterval)) {
    parts.push(`throttleInterval=${status.launchctl.throttleInterval}s`);
  }
  return parts.join(" ");
}

function launchTarget(label) {
  const uid = userInfo().uid;
  return {
    domain: `gui/${uid}`,
    service: `gui/${uid}/${label}`,
  };
}

function defaultBinPath() {
  const current = fileURLToPath(import.meta.url);
  return resolve(dirname(current), "..", "bin", "hovvi");
}

function assertMacos() {
  if (platform() !== "darwin") throw new Error("Hovvi service management currently supports macOS launchd only.");
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlUnescape(value) {
  return String(value)
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function matchValue(text, pattern) {
  const match = pattern.exec(text);
  return match?.[1]?.trim();
}

function matchInteger(text, pattern) {
  const value = matchValue(text, pattern);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isHealthyLaunchctlState({ state, lastExitCode }) {
  if (Number.isInteger(lastExitCode) && lastExitCode !== 0) return false;
  if (!state) return true;
  return /running/i.test(state);
}
