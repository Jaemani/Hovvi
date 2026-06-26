import { commandExists, runText } from "./shell.js";
import { createUdpDatagramBridge } from "./datagram-udp.js";
import { isMoshServerKey, startMoshServer } from "./attach.js";
import { ensureTmuxSession, hasTmuxSession } from "./sessions.js";

export function localMoshHarnessPreflight({ commandExistsFn = commandExists } = {}) {
  const required = ["tmux", "mosh-server"];
  const missing = required.filter((command) => !commandExistsFn(command));
  return {
    ok: missing.length === 0,
    missing,
  };
}

export async function runLocalMoshServerHarness({
  sessionName = `hovvi-harness-${process.pid}`,
  create = true,
  timeoutMs = 5000,
  maxDatagramBytes = 1200,
  probePacket,
} = {}) {
  const preflight = localMoshHarnessPreflight();
  if (!preflight.ok) {
    throw new Error(`Missing harness dependencies: ${preflight.missing.join(", ")}`);
  }

  let createdSession = false;
  let server;
  let bridge;
  const frames = [];

  try {
    if (create && !hasTmuxSession(sessionName)) {
      await ensureTmuxSession(sessionName);
      createdSession = true;
    } else if (!hasTmuxSession(sessionName)) {
      throw new Error(`tmux session not found: ${sessionName}`);
    }

    server = await startMoshServer({ sessionName, timeoutMs });
    if (!Number.isInteger(server.port) || server.port < 1 || server.port > 65535) {
      throw new Error(`mosh-server returned invalid UDP port: ${server.port}`);
    }
    if (!isMoshServerKey(server.key)) {
      throw new Error("mosh-server returned invalid printable key.");
    }

    bridge = createUdpDatagramBridge({
      channelId: "local-mosh-harness",
      remoteHost: "127.0.0.1",
      remotePort: server.port,
      maxDatagramBytes,
      send(type, payload) {
        frames.push({ type, ...payload });
      },
    });
    await waitFor(() => frames.some((frame) => frame.type === "datagram.ready"), timeoutMs);

    let sentProbeBytes = 0;
    if (probePacket) {
      const bytes = Buffer.isBuffer(probePacket) ? probePacket : Buffer.from(probePacket);
      sentProbeBytes = bridge.sendData(bytes) ? bytes.length : 0;
    }

    return {
      ok: true,
      sessionName,
      createdSession,
      mosh: {
        port: server.port,
        key: server.key,
        pid: server.pid,
      },
      datagram: {
        channelId: "local-mosh-harness",
        ready: true,
        maxDatagramBytes,
        sentProbeBytes,
      },
      frames,
      dispose: async () => cleanup({ bridge, server, sessionName, createdSession }),
    };
  } catch (error) {
    await cleanup({ bridge, server, sessionName, createdSession });
    throw error;
  }
}

async function cleanup({ bridge, server, sessionName, createdSession }) {
  bridge?.close?.();
  if (server?.process && !server.process.killed) {
    server.process.kill();
    await waitForProcessExit(server.process, 1000);
  }
  if (createdSession) {
    runText("tmux", ["kill-session", "-t", sessionName], { timeout: 1000 });
  }
}

function waitForProcessExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, timeoutMs);
    child.once?.("exit", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for local mosh harness readiness.");
}
