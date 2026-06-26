import test from "node:test";
import assert from "node:assert/strict";
import { connectAgent } from "../src/agent.js";
import { createRelayServer } from "../src/relay.js";
import { createClient } from "../src/relay-client.js";
import { commandExists, runText } from "../src/shell.js";

test("client opens relay datagram channel from an agent-started mosh attach manifest", async (t) => {
  if (!commandExists("tmux") || !commandExists("mosh-server")) {
    return t.skip("tmux and mosh-server are required for relay attach manifest smoke.");
  }

  const sessionName = `hovvi-relay-attach-${process.pid}-${Date.now()}`;
  const relay = createRelayServer({ token: "dev", datagramTimeoutMs: 5000 });
  await relay.listen();
  const device = {
    id: "mac-attach-1",
    name: "Mac Attach",
    platform: "darwin",
    user: "jaeman",
    capabilities: ["tmux.sessions", "mosh.relay-datagram"],
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

    const { manifest, transport, channel } = await client.prepareMoshDatagramAttach({
      deviceId: device.id,
      sessionName,
      create: true,
      lines: 40,
      timeoutMs: 7000,
      datagramTimeoutMs: 3000,
    });

    assert.equal(manifest.deviceId, device.id);
    assert.equal(manifest.sessionName, sessionName);
    assert.equal(transport.kind, "relay-datagram");
    assert.equal(transport.remoteHost, "127.0.0.1");
    assert.equal(Number.isInteger(transport.remotePort), true);
    assert.match(transport.key || "", /^[A-Za-z0-9+/]{22}$/);
    assert.match(channel.channelId, /^dg_/);
    assert.equal(relay.state.datagrams.size, 1);

    channel.close();
    await waitFor(async () => relay.state.datagrams.size === 0);
  } finally {
    client.close();
    await relay.close();
    await agentDone.catch(() => {});
    runText("tmux", ["kill-session", "-t", sessionName], { timeout: 1000 });
  }
});

async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition.");
}
