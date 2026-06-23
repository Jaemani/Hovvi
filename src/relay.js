import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { envelope, parseEnvelope, serialize } from "./protocol.js";
import { createAccessRegistry } from "./registry.js";

export async function runRelay({ host = "127.0.0.1", port = 8787, token = "dev", registryPath }) {
  const state = createRelayState({ token, registryPath });
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws) => {
    ws.on("message", (data) => handleRelayMessage(state, ws, data));
    ws.on("close", () => unregisterSocket(state, ws));
    ws.on("error", () => unregisterSocket(state, ws));
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  process.stdout.write(`Hovvi relay listening on ws://${host}:${port}\n`);
}

export function createRelayState({ token, registryPath } = {}) {
  return {
    access: createAccessRegistry({ devToken: token, registryPath }),
    sockets: new Map(),
    agents: new Map(),
    clients: new Map(),
    streams: new Map(),
  };
}

export function handleRelayMessage(state, ws, data) {
  let message;
  try {
    message = parseEnvelope(data);
  } catch (error) {
    ws.send(serialize(envelope("error", { message: error.message })));
    return;
  }

  if (message.type === "hello") {
    return registerSocket(state, ws, message);
  }

  const meta = state.sockets.get(ws);
  if (!meta) {
    ws.send(serialize(envelope("error", { message: "hello required before other messages" })));
    return;
  }

  switch (message.type) {
    case "sessions.update":
      return updateSessions(state, ws, message);
    case "devices.list":
      return sendDeviceList(state, ws);
    case "forward.open":
      return forwardOpen(state, ws, message);
    case "forward.ready":
    case "forward.error":
    case "forward.data":
    case "forward.end":
      return forwardStreamMessage(state, ws, message);
    default:
      ws.send(serialize(envelope("error", { message: `unknown message type ${message.type}` })));
  }
}

function registerSocket(state, ws, message) {
  const principal = state.access.authenticate({ role: message.role, token: message.token });
  if (!principal) {
    ws.send(serialize(envelope("error", { message: "invalid relay token" })));
    ws.close(1008, "invalid token");
    return;
  }

  if (message.role === "agent") {
    const device = message.device;
    if (!device?.id) {
      ws.send(serialize(envelope("error", { message: "agent hello requires device.id" })));
      return;
    }
    const meta = { role: "agent", principal, device, sessions: [], ws };
    state.sockets.set(ws, meta);
    state.agents.set(device.id, meta);
    ws.send(serialize(envelope("hello.ok", { role: "agent", deviceId: device.id })));
    broadcastDeviceList(state);
    return;
  }

  if (message.role === "client") {
    const clientId = message.clientId || message.id;
    const meta = { role: "client", principal, clientId, ws };
    state.sockets.set(ws, meta);
    state.clients.set(clientId, meta);
    ws.send(serialize(envelope("hello.ok", { role: "client", clientId })));
    sendDeviceList(state, ws);
    return;
  }

  ws.send(serialize(envelope("error", { message: "hello role must be agent or client" })));
}

function updateSessions(state, ws, message) {
  const meta = state.sockets.get(ws);
  if (meta?.role !== "agent") return;
  meta.sessions = Array.isArray(message.sessions) ? message.sessions : [];
  meta.lastSeenAt = new Date().toISOString();
  broadcastDeviceList(state);
}

function sendDeviceList(state, ws) {
  ws.send(
    serialize(
      envelope("devices.snapshot", {
        devices: [...state.agents.values()].map(publicDevice),
      }),
    ),
  );
}

function broadcastDeviceList(state) {
  for (const client of state.clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) sendDeviceList(state, client.ws);
  }
}

function publicDevice(agent) {
  return {
    ...agent.device,
    lastSeenAt: agent.lastSeenAt,
    sessions: agent.sessions || [],
  };
}

function forwardOpen(state, ws, message) {
  const meta = state.sockets.get(ws);
  if (meta?.role !== "client") return;
  const agent = state.agents.get(message.deviceId);
  if (!agent) {
    ws.send(serialize(envelope("forward.error", { streamId: message.streamId, message: "device offline" })));
    return;
  }

  state.streams.set(message.streamId, {
    clientWs: ws,
    agentWs: agent.ws,
  });
  agent.ws.send(serialize(message));
}

function forwardStreamMessage(state, ws, message) {
  const stream = state.streams.get(message.streamId);
  if (!stream) return;
  const target = ws === stream.clientWs ? stream.agentWs : stream.clientWs;
  if (target.readyState === WebSocket.OPEN) {
    target.send(serialize(message));
  }
  if (message.type === "forward.end" || message.type === "forward.error") {
    state.streams.delete(message.streamId);
  }
}

function unregisterSocket(state, ws) {
  const meta = state.sockets.get(ws);
  if (!meta) return;
  state.sockets.delete(ws);
  if (meta.role === "agent") {
    state.agents.delete(meta.device.id);
    broadcastDeviceList(state);
  }
  if (meta.role === "client") {
    state.clients.delete(meta.clientId);
  }
  for (const [streamId, stream] of state.streams.entries()) {
    if (stream.clientWs === ws || stream.agentWs === ws) {
      state.streams.delete(streamId);
      const peer = stream.clientWs === ws ? stream.agentWs : stream.clientWs;
      if (peer.readyState === WebSocket.OPEN) {
        peer.send(serialize(envelope("forward.end", { streamId })));
      }
    }
  }
}
