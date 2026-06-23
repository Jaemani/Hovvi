import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
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

function openAgent(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
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
