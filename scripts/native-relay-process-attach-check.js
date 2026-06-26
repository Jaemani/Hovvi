import { createSocket } from "node:dgram";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { connectAgent } from "../src/agent.js";
import { createClient } from "../src/relay-client.js";
import { commandExists, runText } from "../src/shell.js";

const sessionName = `hovvi-native-relay-process-${process.pid}`;
const marker = `HOVVI_NATIVE_RELAY_PROCESS_${process.pid}`;
const inputMarker = `HOVVI_RELAY_PROCESS_INPUT_${process.pid}`;
const pasteMarker = `HOVVI_RELAY_PROCESS_PASTE_${process.pid}`;

if (!commandExists("tmux") || !commandExists("mosh-server")) {
  console.log("Skipping native relay process attach check: tmux and mosh-server are required.");
  process.exit(0);
}

if (!existsSync("native/mosh-core/vendor/mosh")) {
  console.log("Skipping native relay process attach check: vendored upstream mosh source is required.");
  process.exit(0);
}

let relayProcess;
let client;
let channel;
let udpShim;
let agentDone;
let pumpDone;
let closed = false;

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
  if (!created.ok) throw new Error(created.text || "failed to create tmux relay process probe session");

  relayProcess = await startRelayProcess();
  const device = {
    id: `native-relay-process-${process.pid}`,
    name: "Native Relay Process Probe",
    platform: "darwin",
    user: process.env.USER || "hovvi",
    capabilities: ["tmux.sessions", "mosh.relay-datagram"],
  };
  agentDone = connectAgent({
    relayUrl: relayProcess.url,
    token: "dev",
    device,
    publishIntervalMs: 60000,
    heartbeatIntervalMs: 60000,
  });

  client = await createClient({ relayUrl: relayProcess.url, token: "dev" });
  await waitFor(() => client.devices().some((candidate) => candidate.id === device.id), 5000);

  const attach = await client.prepareMoshDatagramAttach({
    deviceId: device.id,
    sessionName,
    create: false,
    lines: 40,
    timeoutMs: 7000,
    datagramTimeoutMs: 3000,
  });
  channel = attach.channel;
  udpShim = await createRelayUdpShim(channel);
  pumpDone = pumpRelayToUdp({ channel, socket: udpShim.socket, getPeer: () => udpShim.peer, isClosed: () => closed });

  await run("native/mosh-core/build/upstream/upstream_mosh_server_probe", [
    "--key",
    attach.transport.key,
    "--port",
    String(udpShim.port),
    "--expect",
    marker,
    "--input-expect",
    inputMarker,
    "--paste-expect",
    pasteMarker,
    "--timeout-ms",
    "7000",
  ]);

  console.log("hovvi native relay process attach check passed");
} finally {
  closed = true;
  channel?.close?.();
  client?.close?.();
  udpShim?.socket?.close?.();
  await pumpDone?.catch?.(() => {});
  await agentDone?.catch?.(() => {});
  await relayProcess?.stop?.();
  runText("tmux", ["kill-session", "-t", sessionName], { timeout: 1000 });
}

async function startRelayProcess() {
  const child = spawn(process.execPath, ["bin/hovvi", "relay", "--port", "0", "--token", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for hovvi relay startup.\n${stdout}${stderr}`));
    }, 5000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Hovvi relay listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`hovvi relay exited before startup: code=${code} signal=${signal}\n${stdout}${stderr}`));
    });
  });

  return {
    child,
    url,
    stop: () => stopProcess(child),
  };
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 1000).unref();
  });
}

async function createRelayUdpShim(channel) {
  const socket = createSocket("udp4");
  const state = { peer: null };
  socket.on("message", (message, rinfo) => {
    state.peer = { address: rinfo.address, port: rinfo.port };
    channel.send(message);
  });
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.off("error", reject);
      resolve();
    });
  });
  return {
    socket,
    port: socket.address().port,
    get peer() {
      return state.peer;
    },
  };
}

async function pumpRelayToUdp({ channel, socket, getPeer, isClosed }) {
  while (!isClosed()) {
    try {
      const message = await channel.nextMessage({ timeoutMs: 500 });
      const peer = getPeer();
      if (peer) socket.send(message, peer.port, peer.address);
    } catch (error) {
      if (isClosed()) return;
      if (error.message?.startsWith("Timed out waiting for datagram message")) continue;
      throw error;
    }
  }
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

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for condition.");
}
