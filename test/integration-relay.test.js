import test from "node:test";
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import WebSocket, { WebSocketServer } from "ws";
import { connectAgent } from "../src/agent.js";
import { createRelayServer } from "../src/relay.js";
import { createClient } from "../src/relay-client.js";
import { envelope, parseEnvelope, serialize } from "../src/protocol.js";

test("relay server lists a connected agent through the client API", async () => {
  const relay = createRelayServer({ token: "dev" });
  await relay.listen();
  const agent = await openAgent(relay.url);

  agent.send(
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1", name: "Mac" } })),
  );
  await waitForMessage(agent, "hello.ok");
  agent.send(serialize(envelope("sessions.update", { sessions: [{ name: "main", kind: "tmux" }] })));

  const client = await createClient({ relayUrl: relay.url, token: "dev" });
  const devices = await client.listDevices();

  assert.equal(devices.length, 1);
  assert.equal(devices[0].id, "mac-1");
  assert.equal(devices[0].sessions[0].name, "main");

  client.close();
  agent.close();
  await relay.close();
});

test("relay status endpoint reports live counts", async () => {
  const relay = createRelayServer({ token: "dev" });
  await relay.listen();
  const response = await fetch(`${relay.url.replace("ws://", "http://")}/statusz`);
  const status = await response.json();

  assert.equal(response.status, 200);
  assert.equal(status.ok, true);
  assert.equal(status.agents, 0);
  assert.equal(status.clients, 0);

  await relay.close();
});

test("client datagram channel reaches an agent-owned UDP target through the relay", async () => {
  const udp = await openUdpEchoServer();
  const relay = createRelayServer({ token: "dev", datagramTimeoutMs: 5000 });
  await relay.listen();
  const device = {
    id: "mac-1",
    name: "Mac",
    platform: "darwin",
    user: "jaeman",
    capabilities: ["mosh.relay-datagram"],
  };
  const agentDone = connectAgent({
    relayUrl: relay.url,
    token: "dev",
    device,
    publishIntervalMs: 60000,
    heartbeatIntervalMs: 60000,
  });
  const client = await createClient({ relayUrl: relay.url, token: "dev" });

  try {
    await waitFor(async () => relay.state.agents.has(device.id));

    const channel = await client.openDatagram({
      deviceId: device.id,
      remoteHost: "127.0.0.1",
      remotePort: udp.port,
      maxDatagramBytes: 1200,
    });
    channel.send(Buffer.from("ping"));

    const reply = await channel.nextMessage();
    assert.equal(reply.toString(), "echo:ping");

    channel.close();
    await waitFor(async () => relay.state.datagrams.size === 0);
  } finally {
    client.close();
    await relay.close();
    await closeUdp(udp.socket);
    await agentDone.catch(() => {});
  }
});

test("client datagram channel rejects oversize payloads before relay send", async () => {
  const udp = await openUdpEchoServer();
  const relay = createRelayServer({ token: "dev", datagramTimeoutMs: 5000 });
  await relay.listen();
  const device = {
    id: "mac-1",
    name: "Mac",
    platform: "darwin",
    user: "jaeman",
    capabilities: ["mosh.relay-datagram"],
  };
  const agentDone = connectAgent({
    relayUrl: relay.url,
    token: "dev",
    device,
    publishIntervalMs: 60000,
    heartbeatIntervalMs: 60000,
  });
  const client = await createClient({ relayUrl: relay.url, token: "dev" });

  try {
    await waitFor(async () => relay.state.agents.has(device.id));

    const channel = await client.openDatagram({
      deviceId: device.id,
      remoteHost: "127.0.0.1",
      remotePort: udp.port,
      maxDatagramBytes: 9,
    });

    assert.throws(() => channel.send(Buffer.from("0123456789")), /datagram exceeds maxDatagramBytes \(10 > 9\)/);
    assert.equal(relay.state.datagrams.size, 1);

    channel.send(Buffer.from("pong"));
    const reply = await channel.nextMessage();
    assert.equal(reply.toString(), "echo:pong");

    channel.close();
    await waitFor(async () => relay.state.datagrams.size === 0);
  } finally {
    client.close();
    await relay.close();
    await closeUdp(udp.socket);
    await agentDone.catch(() => {});
  }
});

test("client rejects pending requests when relay disconnects unexpectedly", async () => {
  const relay = await openClosingRelay("devices.list");
  const client = await createClient({ relayUrl: relay.url, token: "dev" });

  try {
    await assert.rejects(client.listDevices({ timeoutMs: 5000 }), /relay client disconnected/);
    await assert.rejects(client.prepareAttach({ deviceId: "mac-1", timeoutMs: 5000 }), /relay client is closed/);
  } finally {
    client.close();
    await relay.close();
  }
});

test("client rejects pending datagram opens when relay disconnects unexpectedly", async () => {
  const relay = await openClosingRelay("datagram.open");
  const client = await createClient({ relayUrl: relay.url, token: "dev" });

  try {
    await assert.rejects(
      client.openDatagram({
        deviceId: "mac-1",
        remoteHost: "127.0.0.1",
        remotePort: 60000,
        timeoutMs: 5000,
      }),
      /relay client disconnected/,
    );
  } finally {
    client.close();
    await relay.close();
  }
});

test("client rejects pending attach, scrollback, and forward requests when relay disconnects unexpectedly", async () => {
  await assertRejectsPendingRequest("session.attach.prepare", (client) =>
    client.prepareAttach({ deviceId: "mac-1", timeoutMs: 5000 }),
  );
  await assertRejectsPendingRequest("session.scrollback.fetch", (client) =>
    client.fetchScrollback({ deviceId: "mac-1", timeoutMs: 5000 }),
  );
  await assertRejectsPendingRequest("forward.open", (client) =>
    client.openForward({ deviceId: "mac-1", remoteHost: "127.0.0.1", remotePort: 22 }),
  );
});

function openAgent(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function openClosingRelay(closeOnType) {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      const message = parseEnvelope(data);
      if (message.type === closeOnType) ws.close();
    });
  });
  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      wss.off("error", reject);
      const address = wss.address();
      resolve({
        url: `ws://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve) => wss.close(closeResolve)),
      });
    });
  });
}

async function assertRejectsPendingRequest(closeOnType, operation) {
  const relay = await openClosingRelay(closeOnType);
  const client = await createClient({ relayUrl: relay.url, token: "dev" });

  try {
    await assert.rejects(operation(client), /relay client disconnected/);
  } finally {
    client.close();
    await relay.close();
  }
}

function waitForMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 3000);
    ws.on("message", function onMessage(data) {
      const message = parseEnvelope(data);
      if (message.type === type) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(message);
      }
    });
  });
}

function openUdpEchoServer() {
  const socket = createSocket("udp4");
  socket.on("message", (message, rinfo) => {
    socket.send(Buffer.concat([Buffer.from("echo:"), message]), rinfo.port, rinfo.address);
  });
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      socket.off("error", reject);
      resolve({ socket, port: socket.address().port });
    });
  });
}

function closeUdp(socket) {
  return new Promise((resolve) => socket.close(resolve));
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition.");
}
