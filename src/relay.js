import http from "node:http";
import { randomUUID } from "node:crypto";
import WebSocket, { WebSocketServer } from "ws";
import { createAuditSink } from "./audit.js";
import { envelope, parseAndValidateEnvelope, serialize } from "./protocol.js";
import { createAccessRegistry } from "./registry.js";

export async function runRelay({
  host = "127.0.0.1",
  port = 8787,
  token = "dev",
  registryPath,
  auditLogPath,
  deviceTimeoutMs = 30000,
  datagramTimeoutMs = 30000,
  sweepIntervalMs = 5000,
  maxPayloadBytes = 1024 * 1024,
}) {
  const relay = createRelayServer({
    host,
    port,
    token,
    registryPath,
    auditLogPath,
    deviceTimeoutMs,
    datagramTimeoutMs,
    sweepIntervalMs,
    maxPayloadBytes,
  });
  await relay.listen();
  process.stdout.write(`Hovvi relay listening on ${relay.url}\n`);
}

export function createRelayServer({
  host = "127.0.0.1",
  port = 0,
  token = "dev",
  registryPath,
  auditLogPath,
  deviceTimeoutMs = 30000,
  datagramTimeoutMs = 30000,
  sweepIntervalMs = 5000,
  maxPayloadBytes = 1024 * 1024,
} = {}) {
  const state = createRelayState({ token, registryPath, auditLogPath, deviceTimeoutMs, datagramTimeoutMs });
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.url === "/statusz" || request.url === "/metrics.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(relayStatus(state)));
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });

  const wss = new WebSocketServer({ server, maxPayload: maxPayloadBytes });
  wss.on("connection", (ws) => {
    state.metrics.connectionsAccepted += 1;
    ws.on("message", (data) => handleRelayMessage(state, ws, data));
    ws.on("close", () => unregisterSocket(state, ws));
    ws.on("error", () => unregisterSocket(state, ws));
  });

  let sweep;

  return {
    state,
    server,
    wss,
    get url() {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      return `ws://${host}:${actualPort}`;
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          sweep = setInterval(() => {
            sweepStaleAgents(state);
            sweepStaleDatagrams(state);
          }, sweepIntervalMs);
          resolve(this);
        });
      });
    },
    close() {
      clearInterval(sweep);
      for (const ws of wss.clients) ws.close();
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

export function createRelayState({ token, registryPath, auditLogPath, deviceTimeoutMs = 30000, datagramTimeoutMs = 30000 } = {}) {
  return {
    access: createAccessRegistry({ devToken: token, registryPath }),
    audit: createAuditSink({ path: auditLogPath }),
    deviceTimeoutMs,
    datagramTimeoutMs,
    relayId: randomUUID(),
    startedAt: new Date().toISOString(),
    metrics: {
      connectionsAccepted: 0,
      messagesReceived: 0,
      invalidMessages: 0,
      staleAgentsPruned: 0,
      staleDatagramsPruned: 0,
      authAccepted: 0,
      authRejected: 0,
    },
    sockets: new Map(),
    agents: new Map(),
    clients: new Map(),
    streams: new Map(),
    datagrams: new Map(),
  };
}

export function handleRelayMessage(state, ws, data) {
  let message;
  state.metrics.messagesReceived += 1;
  try {
    message = parseAndValidateEnvelope(data);
  } catch (error) {
    state.metrics.invalidMessages += 1;
    ws.send(serialize(envelope("error", { code: "invalid_message", field: error.field, message: error.message })));
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
    case "agent.heartbeat":
      return agentHeartbeat(state, ws, message);
    case "devices.list":
      return sendDeviceList(state, ws);
    case "forward.open":
      return forwardOpen(state, ws, message);
    case "datagram.open":
      return datagramOpen(state, ws, message);
    case "session.attach.prepare":
      return attachPrepare(state, ws, message);
    case "session.attach.ready":
    case "session.attach.error":
      return attachResponse(state, ws, message);
    case "session.scrollback.fetch":
      return routeAgentRequest(state, ws, message, "scrollback-request");
    case "session.scrollback.ready":
    case "session.scrollback.error":
      return routeAgentResponse(state, ws, message);
    case "forward.ready":
    case "forward.error":
    case "forward.data":
    case "forward.end":
      return forwardStreamMessage(state, ws, message);
    case "datagram.ready":
    case "datagram.error":
    case "datagram.data":
    case "datagram.close":
      return datagramMessage(state, ws, message);
    default:
      ws.send(serialize(envelope("error", { message: `unknown message type ${message.type}` })));
  }
}

export function relayStatus(state) {
  return {
    ok: true,
    relayId: state.relayId,
    startedAt: state.startedAt,
    deviceTimeoutMs: state.deviceTimeoutMs,
    datagramTimeoutMs: state.datagramTimeoutMs,
    agents: state.agents.size,
    clients: state.clients.size,
    streams: state.streams.size,
    datagrams: state.datagrams.size,
    metrics: { ...state.metrics },
  };
}

function attachPrepare(state, ws, message) {
  return routeAgentRequest(state, ws, message, "attach-request");
}

function routeAgentRequest(state, ws, message, kind) {
  const meta = state.sockets.get(ws);
  if (meta?.role !== "client") return;
  const agent = state.agents.get(message.deviceId);
  if (!agent) {
    ws.send(
      serialize(
        envelope(responseErrorType(kind), {
          requestId: message.id,
          message: "device offline",
        }),
      ),
    );
    return;
  }
  state.streams.set(message.id, {
    clientWs: ws,
    agentWs: agent.ws,
    kind,
  });
  agent.ws.send(serialize(message));
}

function attachResponse(state, ws, message) {
  return routeAgentResponse(state, ws, message);
}

function routeAgentResponse(state, ws, message) {
  const stream = state.streams.get(message.requestId);
  if (!stream) return;
  const target = ws === stream.clientWs ? stream.agentWs : stream.clientWs;
  if (target.readyState === WebSocket.OPEN) target.send(serialize(message));
  state.streams.delete(message.requestId);
}

function responseErrorType(kind) {
  if (kind === "scrollback-request") return "session.scrollback.error";
  return "session.attach.error";
}

function registerSocket(state, ws, message) {
  const clientId = message.clientId || message.id;
  const deviceId = message.device?.id;
  const auth = state.access.authenticateDetailed({
    role: message.role,
    token: message.token,
    deviceId,
    clientId,
  });
  if (!auth.ok) {
    state.metrics.authRejected += 1;
    state.audit.record({
      type: "auth.reject",
      role: message.role,
      reason: auth.reason,
      deviceId,
      clientId: message.role === "client" ? clientId : undefined,
    });
    ws.send(serialize(envelope("error", { message: "invalid relay token" })));
    ws.close(1008, "invalid token");
    return;
  }
  const principal = auth.principal;
  state.metrics.authAccepted += 1;
  state.audit.record({
    type: "auth.accept",
    role: message.role,
    subject: principal.subject,
    source: principal.source,
    deviceId,
    clientId: message.role === "client" ? clientId : undefined,
  });

  if (message.role === "agent") {
    const device = message.device;
    if (!device?.id) {
      ws.send(serialize(envelope("error", { message: "agent hello requires device.id" })));
      return;
    }
    const now = Date.now();
    const meta = { role: "agent", principal, device, sessions: [], ws, lastSeenMs: now };
    state.sockets.set(ws, meta);
    state.agents.set(device.id, meta);
    ws.send(serialize(envelope("hello.ok", { role: "agent", deviceId: device.id })));
    broadcastDeviceList(state);
    return;
  }

  if (message.role === "client") {
    const meta = { role: "client", principal, clientId, ws };
    state.sockets.set(ws, meta);
    state.clients.set(clientId, meta);
    ws.send(serialize(envelope("hello.ok", { role: "client", clientId })));
    sendDeviceList(state, ws);
    return;
  }

  ws.send(serialize(envelope("error", { message: "hello role must be agent or client" })));
}

function agentHeartbeat(state, ws, message) {
  const meta = state.sockets.get(ws);
  if (meta?.role !== "agent") return;
  if (message.deviceId !== meta.device.id) {
    ws.send(serialize(envelope("error", { code: "device_mismatch", message: "heartbeat deviceId does not match registered agent" })));
    return;
  }
  meta.lastSeenMs = Date.now();
  meta.lastSeenAt = new Date().toISOString();
  if (message.capabilities) {
    meta.device.capabilities = message.capabilities;
  }
}

function updateSessions(state, ws, message) {
  const meta = state.sockets.get(ws);
  if (meta?.role !== "agent") return;
  meta.sessions = Array.isArray(message.sessions) ? message.sessions : [];
  meta.lastSeenMs = Date.now();
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

export function sweepStaleAgents(state, now = Date.now()) {
  const stale = [...state.agents.values()].filter((agent) => {
    if (agent.ws.readyState !== WebSocket.OPEN) return true;
    return now - (agent.lastSeenMs || 0) > state.deviceTimeoutMs;
  });
  for (const agent of stale) {
    agent.ws.close(1001, "stale agent");
    unregisterSocket(state, agent.ws);
  }
  state.metrics.staleAgentsPruned += stale.length;
  return stale.length;
}

export function sweepStaleDatagrams(state, now = Date.now()) {
  const stale = [...state.datagrams.entries()].filter(([, channel]) => {
    if (channel.clientWs.readyState !== WebSocket.OPEN || channel.agentWs.readyState !== WebSocket.OPEN) return true;
    return now - (channel.lastSeenMs || 0) > state.datagramTimeoutMs;
  });
  for (const [channelId, channel] of stale) {
    state.datagrams.delete(channelId);
    notifyDatagramClose(channel.clientWs, channelId);
    notifyDatagramClose(channel.agentWs, channelId);
  }
  state.metrics.staleDatagramsPruned += stale.length;
  return stale.length;
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

function datagramOpen(state, ws, message) {
  const meta = state.sockets.get(ws);
  if (meta?.role !== "client") return;
  const agent = state.agents.get(message.deviceId);
  if (!agent) {
    ws.send(serialize(envelope("datagram.error", { channelId: message.channelId, message: "device offline" })));
    return;
  }

  state.datagrams.set(message.channelId, {
    clientWs: ws,
    agentWs: agent.ws,
    lastSeenMs: Date.now(),
  });
  agent.ws.send(serialize(message));
}

function datagramMessage(state, ws, message) {
  const channel = state.datagrams.get(message.channelId);
  if (!channel) return;
  channel.lastSeenMs = Date.now();
  const target = ws === channel.clientWs ? channel.agentWs : channel.clientWs;
  if (target.readyState === WebSocket.OPEN) {
    target.send(serialize(message));
  }
  if (message.type === "datagram.close" || message.type === "datagram.error") {
    state.datagrams.delete(message.channelId);
  }
}

function notifyDatagramClose(ws, channelId) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(serialize(envelope("datagram.close", { channelId })));
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
  for (const [channelId, channel] of state.datagrams.entries()) {
    if (channel.clientWs === ws || channel.agentWs === ws) {
      state.datagrams.delete(channelId);
      const peer = channel.clientWs === ws ? channel.agentWs : channel.clientWs;
      notifyDatagramClose(peer, channelId);
    }
  }
}
