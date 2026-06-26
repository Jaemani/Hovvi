import { spawn as spawnChild } from "node:child_process";
import { userInfo } from "node:os";

export function buildAttachManifest({ device, sessionName, lines = 2000, mosh } = {}) {
  const target = escapeTmuxTarget(sessionName);
  const user = userInfo().username;
  const moshCommand = buildMoshServerCommand({ sessionName: target });
  const hasMoshTransport = isMoshPort(mosh?.port) && isMoshServerKey(mosh?.key);
  const moshMethod = {
    name: "mosh",
    priority: 10,
    status: hasMoshTransport ? "available" : mosh?.error ? "unavailable" : "planned",
    command: [moshCommand.command, ...moshCommand.args],
    notes: mosh?.error
      ? `mosh-server bootstrap failed: ${mosh.error}`
      : "Compatibility target for mobile attach. Relay datagrams carry the resulting encrypted mosh packets.",
  };

  if (hasMoshTransport) {
    moshMethod.transport = {
      kind: "relay-datagram",
      label: "mosh",
      remoteHost: "127.0.0.1",
      remotePort: mosh.port,
      key: mosh.key,
      maxDatagramBytes: 1200,
    };
  }

  return {
    kind: "mosh-tmux",
    version: 1,
    deviceId: device?.id,
    deviceName: device?.name,
    sessionName,
    user,
    methods: [
      moshMethod,
      {
        name: "ssh-tcp-forward",
        priority: 20,
        status: "available",
        command: ["ssh", "-p", "<local-forward-port>", "localhost", "--", "tmux", "attach-session", "-t", target],
        notes: "Development fallback over Hovvi relay TCP forwarding.",
      },
      {
        name: "local-tmux",
        priority: 30,
        status: "available-on-host",
        command: ["tmux", "attach-session", "-t", target],
        notes: "Host-local fallback.",
      },
    ],
    scrollback: {
      source: "tmux.capture-pane",
      command: ["tmux", "capture-pane", "-t", target, "-p", "-S", `-${lines}`],
      lines,
    },
    controlMode: {
      source: "tmux.control-mode",
      command: ["tmux", "-CC", "attach-session", "-t", target],
    },
  };
}

export function buildMoshServerCommand({
  sessionName,
  columns = 256,
  lang = process.env.LANG || "en_US.UTF-8",
  bindHost = "127.0.0.1",
}) {
  const target = escapeTmuxTarget(sessionName);
  return {
    command: "mosh-server",
    args: [
      "new",
      "-i",
      bindHost,
      "-c",
      String(columns),
      "-l",
      `LANG=${lang}`,
      "--",
      "tmux",
      "attach-session",
      "-t",
      target,
    ],
  };
}

export async function startMoshServer({ sessionName, timeoutMs = 5000, spawn = spawnChild } = {}) {
  const command = buildMoshServerCommand({ sessionName });
  const child = spawn(command.command, command.args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = "";
    let stderr = "";
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill?.();
      reject(new Error(`Timed out waiting for mosh-server bootstrap for ${sessionName}.`));
    }, timeoutMs);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        pid: child.pid,
        command: command.command,
        args: command.args,
        process: child,
        getOutput: () => output,
        getStderr: () => stderr,
      });
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };

    const readConnectLine = (chunk) => {
      output += chunk.toString("utf8");
      const parsed = parseMoshConnectLine(output);
      if (parsed) finish(parsed);
    };

    child.stdout?.on("data", readConnectLine);
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      readConnectLine(chunk);
    });
    child.once?.("error", fail);
    child.once?.("exit", (code, signal) => {
      if (settled) return;
      const reason = signal ? `signal ${signal}` : `code ${code}`;
      const detail = stderr.trim() || output.trim() || "no output";
      fail(new Error(`mosh-server exited before bootstrap (${reason}): ${detail}`));
    });
  });
}

export function escapeTmuxTarget(sessionName) {
  if (!sessionName || typeof sessionName !== "string") throw new Error("sessionName is required.");
  if (/[\r\n\t]/.test(sessionName)) throw new Error("sessionName cannot contain control characters.");
  return sessionName;
}

export function parseMoshConnectLine(line) {
  const match = /^MOSH CONNECT (?<port>\d+) (?<key>[A-Za-z0-9+/]{22})$/m.exec(line.trim());
  if (!match) return null;
  const port = Number(match.groups.port);
  if (!isMoshPort(port) || !isMoshServerKey(match.groups.key)) return null;
  return {
    port,
    key: match.groups.key,
  };
}

export function isMoshServerKey(key) {
  return typeof key === "string" && /^[A-Za-z0-9+/]{22}$/.test(key);
}

function isMoshPort(port) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}
