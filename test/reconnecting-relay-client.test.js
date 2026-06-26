import test from "node:test";
import assert from "node:assert/strict";
import { connectAgent } from "../src/agent.js";
import { createRelayServer } from "../src/relay.js";
import { createReconnectingClient } from "../src/reconnecting-relay-client.js";

test("reconnecting relay client uses a fresh client after relay disconnect", async () => {
  let relay = createRelayServer({ token: "dev" });
  await relay.listen();
  const relayPort = new URL(relay.url).port;
  let agentDone = connectProbeAgent(relay.url, "mac-reconnect-1");
  await waitFor(() => relay.state.agents.has("mac-reconnect-1"));

  const client = createReconnectingClient({
    relayUrl: relay.url,
    token: "dev",
    maxConnectAttempts: 1,
  });

  try {
    const firstDevices = await client.listDevices({ timeoutMs: 1000 });
    assert.equal(firstDevices.some((device) => device.id === "mac-reconnect-1"), true);

    await relay.close();
    await agentDone.catch(() => {});
    await assert.rejects(client.listDevices({ timeoutMs: 1000 }), /relay client (is closed|disconnected)/);

    relay = createRelayServer({ token: "dev", port: Number(relayPort) });
    await relay.listen();
    agentDone = connectProbeAgent(relay.url, "mac-reconnect-2");
    await waitFor(() => relay.state.agents.has("mac-reconnect-2"));

    const secondDevices = await client.listDevices({ timeoutMs: 1000 });
    assert.equal(secondDevices.some((device) => device.id === "mac-reconnect-2"), true);
  } finally {
    client.close();
    await relay.close().catch(() => {});
    await agentDone.catch(() => {});
  }
});

function connectProbeAgent(relayUrl, id) {
  return connectAgent({
    relayUrl,
    token: "dev",
    device: {
      id,
      name: id,
      platform: "darwin",
      user: "hovvi",
      capabilities: ["tmux.sessions", "mosh.relay-datagram"],
    },
    publishIntervalMs: 60000,
    heartbeatIntervalMs: 60000,
  });
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition.");
}
