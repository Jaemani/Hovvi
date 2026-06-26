import { spawn } from "node:child_process";
import { startMoshServer } from "../src/attach.js";
import { commandExists, runText } from "../src/shell.js";

const sessionName = `hovvi-native-probe-${process.pid}`;
const marker = `HOVVI_NATIVE_PROBE_${process.pid}`;

if (!commandExists("tmux") || !commandExists("mosh-server")) {
  console.log("Skipping native mosh-server harness check: tmux and mosh-server are required.");
  process.exit(0);
}

try {
  await run("make", ["-C", "native/mosh-core", "mosh-server-probe"]);
  const created = runText("tmux", [
    "new-session",
    "-d",
    "-s",
    sessionName,
    "sh",
    "-lc",
    `printf '${marker}\\n'; exec sh`,
  ]);
  if (!created.ok) throw new Error(created.text || "failed to create tmux probe session");

  const server = await startMoshServer({ sessionName, timeoutMs: 5000 });
  try {
    await sleep(200);
    try {
      await run("native/mosh-core/build/upstream/upstream_mosh_server_probe", [
        "--key",
        server.key,
        "--port",
        String(server.port),
        "--expect",
        marker,
        "--timeout-ms",
        "5000",
      ]);
    } catch (error) {
      const detail = [server.getStderr?.(), server.getOutput?.()].filter(Boolean).join("\n").trim();
      if (detail) console.error(detail);
      throw error;
    }
  } finally {
    server.process?.kill?.();
  }
} finally {
  runText("tmux", ["kill-session", "-t", sessionName], { timeout: 1000 });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} exited with signal ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
