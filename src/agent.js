import { connect } from "node:net";
import { hostname, platform, userInfo } from "node:os";
import WebSocket from "ws";
import { getConfig, saveConfig } from "./config.js";
import { envelope, parseEnvelope, randomId, serialize } from "./protocol.js";
import { listSessions } from "./sessions.js";

export async function runAgent({ relayUrl, token, name }) {
  const device = getDevice(name);
  process.stdout.write(`Starting Hovvi agent for ${device.name} (${device.id})\n`);
  for (;;) {
    try {
      await connectAgent({ relayUrl, token, device });
    } catch (error) {
      process.stderr.write(`Agent disconnected: ${error.message}\n`);
      await sleep(2000);
    }
  }
}

export function getDevice(name) {
  const config = getConfig();
  config.device ||= {};
  config.device.id ||= `dev_${randomId()}`;
  config.device.name = name || config.device.name || hostname();
  config.device.platform = platform();
  config.device.user = userInfo().username;
  config.device.capabilities = ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target"];
  saveConfig(config);
  return config.device;
}

async function connectAgent({ relayUrl, token, device }) {
  const ws = new WebSocket(relayUrl);
  const forwards = new Map();
  let timer;

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  ws.send(serialize(envelope("hello", { role: "agent", token, device })));
  ws.on("message", (data) => handleAgentMessage(ws, forwards, data));
  ws.on("close", () => {
    clearInterval(timer);
    for (const socket of forwards.values()) socket.destroy();
    forwards.clear();
  });

  const publish = async () => {
    const sessions = await listSessions();
    ws.send(serialize(envelope("sessions.update", { sessions })));
  };
  await publish();
  timer = setInterval(() => {
    publish().catch((error) => {
      ws.send(serialize(envelope("error", { message: error.message })));
    });
  }, 5000);

  await new Promise((resolve, reject) => {
    ws.once("close", resolve);
    ws.once("error", reject);
  });
}

function handleAgentMessage(ws, forwards, data) {
  let message;
  try {
    message = parseEnvelope(data);
  } catch {
    return;
  }

  switch (message.type) {
    case "forward.open":
      return openForward(ws, forwards, message);
    case "forward.data":
      return writeForward(forwards, message);
    case "forward.end":
      return closeForward(forwards, message.streamId);
    default:
      return;
  }
}

function openForward(ws, forwards, message) {
  const socket = connect({
    host: message.remoteHost || "127.0.0.1",
    port: Number(message.remotePort || 22),
  });
  forwards.set(message.streamId, socket);

  socket.on("connect", () => {
    ws.send(serialize(envelope("forward.ready", { streamId: message.streamId })));
  });
  socket.on("data", (chunk) => {
    ws.send(
      serialize(
        envelope("forward.data", {
          streamId: message.streamId,
          data: chunk.toString("base64"),
        }),
      ),
    );
  });
  socket.on("end", () => {
    ws.send(serialize(envelope("forward.end", { streamId: message.streamId })));
  });
  socket.on("close", () => {
    forwards.delete(message.streamId);
  });
  socket.on("error", (error) => {
    ws.send(serialize(envelope("forward.error", { streamId: message.streamId, message: error.message })));
  });
}

function writeForward(forwards, message) {
  const socket = forwards.get(message.streamId);
  if (!socket) return;
  socket.write(Buffer.from(message.data || "", "base64"));
}

function closeForward(forwards, streamId) {
  const socket = forwards.get(streamId);
  if (socket) socket.destroy();
  forwards.delete(streamId);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
