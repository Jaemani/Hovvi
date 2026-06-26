import { connect } from "node:net";
import { hostname, platform, userInfo } from "node:os";
import WebSocket from "ws";
import { getConfig, saveConfig } from "./config.js";
import { envelope, parseAndValidateEnvelope, randomId, serialize } from "./protocol.js";
import { buildAttachManifest, startMoshServer } from "./attach.js";
import { captureTmuxScrollback, ensureTmuxSession, hasTmuxSession, listSessions } from "./sessions.js";
import { createUdpDatagramBridge } from "./datagram-udp.js";

export async function runAgent({ relayUrl, token, name, publishIntervalMs = 5000, heartbeatIntervalMs = 10000 }) {
  const device = getDevice(name);
  process.stdout.write(`Starting Hovvi agent for ${device.name} (${device.id})\n`);
  for (;;) {
    try {
      await connectAgent({ relayUrl, token, device, publishIntervalMs, heartbeatIntervalMs });
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
  config.device.capabilities = ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram"];
  saveConfig(config);
  return config.device;
}

async function connectAgent({ relayUrl, token, device, publishIntervalMs, heartbeatIntervalMs }) {
  const ws = new WebSocket(relayUrl);
  const forwards = new Map();
  const datagrams = new Map();
  const moshServers = new Map();
  let publishTimer;
  let heartbeatTimer;

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  ws.send(serialize(envelope("hello", { role: "agent", token, device })));
  ws.on("message", (data) => handleAgentMessage(ws, forwards, datagrams, moshServers, device, data));
  ws.on("close", () => {
    clearInterval(publishTimer);
    clearInterval(heartbeatTimer);
    for (const socket of forwards.values()) socket.destroy();
    forwards.clear();
    for (const bridge of datagrams.values()) bridge.close();
    datagrams.clear();
    for (const server of moshServers.values()) server.process?.kill?.();
    moshServers.clear();
  });

  const heartbeat = () => {
    ws.send(
      serialize(
        envelope("agent.heartbeat", {
          deviceId: device.id,
          capabilities: device.capabilities || [],
        }),
      ),
    );
  };
  const publish = async () => {
    const sessions = await listSessions();
    ws.send(serialize(envelope("sessions.update", { sessions })));
  };
  heartbeat();
  await publish();
  heartbeatTimer = setInterval(heartbeat, heartbeatIntervalMs);
  publishTimer = setInterval(() => {
    publish().catch((error) => {
      ws.send(serialize(envelope("error", { message: error.message })));
    });
  }, publishIntervalMs);

  await new Promise((resolve, reject) => {
    ws.once("close", resolve);
    ws.once("error", reject);
  });
}

function handleAgentMessage(ws, forwards, datagrams, moshServers, device, data) {
  let message;
  try {
    message = parseAndValidateEnvelope(data);
  } catch {
    return;
  }

  switch (message.type) {
    case "forward.open":
      return openForward(ws, forwards, message);
    case "datagram.open":
      return openDatagram(ws, datagrams, message);
    case "session.attach.prepare":
      return prepareAttach(ws, device, moshServers, message);
    case "session.scrollback.fetch":
      return fetchScrollback(ws, message);
    case "forward.data":
      return writeForward(forwards, message);
    case "forward.end":
      return closeForward(forwards, message.streamId);
    case "datagram.data":
      return writeDatagram(datagrams, message);
    case "datagram.close":
      return closeDatagram(datagrams, message.channelId);
    default:
      return;
  }
}

async function fetchScrollback(ws, message) {
  try {
    const sessionName = message.sessionName || "main";
    if (!hasTmuxSession(sessionName)) throw new Error(`tmux session not found: ${sessionName}`);
    const lines = Number(message.lines || 2000);
    const text = await captureTmuxScrollback(sessionName, lines);
    ws.send(
      serialize(
        envelope("session.scrollback.ready", {
          requestId: message.id,
          sessionName,
          lines,
          text,
        }),
      ),
    );
  } catch (error) {
    ws.send(serialize(envelope("session.scrollback.error", { requestId: message.id, message: error.message })));
  }
}

async function prepareAttach(ws, device, moshServers, message) {
  try {
    const sessionName = message.sessionName || "main";
    if (message.create) {
      await ensureTmuxSession(sessionName);
    } else if (!hasTmuxSession(sessionName)) {
      throw new Error(`tmux session not found: ${sessionName}`);
    }
    let mosh;
    try {
      const server = await startMoshServer({ sessionName });
      const serverKey = `${message.id}:${server.port}`;
      moshServers.set(serverKey, server);
      server.process?.once?.("exit", () => moshServers.delete(serverKey));
      mosh = { port: server.port, key: server.key, pid: server.pid };
    } catch (error) {
      mosh = { error: error.message };
    }
    const manifest = buildAttachManifest({
      device,
      sessionName,
      lines: Number(message.lines || 2000),
      mosh,
    });
    ws.send(serialize(envelope("session.attach.ready", { requestId: message.id, manifest })));
  } catch (error) {
    ws.send(serialize(envelope("session.attach.error", { requestId: message.id, message: error.message })));
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

function openDatagram(ws, datagrams, message) {
  try {
    const bridge = createUdpDatagramBridge({
      channelId: message.channelId,
      remoteHost: message.remoteHost || "127.0.0.1",
      remotePort: message.remotePort,
      maxDatagramBytes: Number(message.maxDatagramBytes || 1200),
      send(type, payload) {
        ws.send(serialize(envelope(type, payload)));
      },
    });
    datagrams.set(message.channelId, bridge);
  } catch (error) {
    ws.send(serialize(envelope("datagram.error", { channelId: message.channelId, message: error.message })));
  }
}

function writeDatagram(datagrams, message) {
  const bridge = datagrams.get(message.channelId);
  if (!bridge) return;
  bridge.sendData(Buffer.from(message.data || "", "base64"));
}

function closeDatagram(datagrams, channelId) {
  const bridge = datagrams.get(channelId);
  if (bridge) bridge.close();
  datagrams.delete(channelId);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
