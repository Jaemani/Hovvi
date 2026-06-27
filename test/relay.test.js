import test from "node:test";
import assert from "node:assert/strict";
import { createRelayState, handleRelayMessage, relayStatus, sweepStaleAgents, sweepStaleDatagrams } from "../src/relay.js";
import { envelope, serialize } from "../src/protocol.js";
import { hashToken } from "../src/registry.js";

test("relay registers agent and sends device snapshot to client", () => {
  const state = createRelayState({ token: "dev" });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1", name: "Mac" } })),
  );
  handleRelayMessage(state, agent, serialize(envelope("sessions.update", { sessions: [{ name: "main" }] })));
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));

  const snapshot = client.messages.map(JSON.parse).find((message) => message.type === "devices.snapshot");
  assert.equal(snapshot.devices.length, 1);
  assert.equal(snapshot.devices[0].id, "mac-1");
  assert.equal(snapshot.devices[0].sessions[0].name, "main");
});

test("relay rejects invalid token", () => {
  const state = createRelayState({ token: "dev" });
  const client = fakeSocket();
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "wrong" })));

  assert.equal(client.closed, true);
  const error = client.messages.map(JSON.parse).find((message) => message.type === "error");
  assert.equal(error.message, "invalid relay token");
  assert.equal(state.metrics.authRejected, 1);
  assert.equal(state.audit.recent().at(-1).reason, "unknown_token");
});

test("relay accepts registry token for scoped role", () => {
  const state = createRelayState();
  state.access.registry.tokens = [
    {
      name: "agent-token",
      hash: "sha256:2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
      roles: ["agent"],
    },
  ];
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "secret", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "secret" })));

  assert.equal(state.agents.has("mac-1"), true);
  assert.equal(client.closed, true);
});

test("relay enforces device-bound registry tokens", () => {
  const state = createRelayState();
  state.access.registry.tokens = [
    {
      name: "mac-agent",
      hash: "sha256:2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b",
      roles: ["agent"],
      deviceIds: ["mac-1"],
    },
  ];
  const agent = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "secret", device: { id: "mac-2" } })),
  );

  assert.equal(agent.closed, true);
  assert.equal(state.agents.has("mac-2"), false);
  assert.equal(state.metrics.authRejected, 1);
  assert.equal(state.audit.recent().at(-1).reason, "device_not_allowed");
});

test("relay scopes device snapshots to registry token account ids", () => {
  const state = createRelayState();
  state.access.registry.tokens = [
    { name: "acct-1-agent", accountId: "acct_1", hash: hashToken("agent-1"), roles: ["agent"] },
    { name: "acct-2-agent", accountId: "acct_2", hash: hashToken("agent-2"), roles: ["agent"] },
    { name: "acct-1-client", accountId: "acct_1", hash: hashToken("client-1"), roles: ["client"] },
  ];
  const agentOne = fakeSocket();
  const agentTwo = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agentOne,
    serialize(envelope("hello", { role: "agent", token: "agent-1", device: { id: "mac-1" } })),
  );
  handleRelayMessage(
    state,
    agentTwo,
    serialize(envelope("hello", { role: "agent", token: "agent-2", device: { id: "mac-2" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "client-1" })));

  const snapshot = client.messages.map(JSON.parse).filter((message) => message.type === "devices.snapshot").at(-1);
  assert.deepEqual(snapshot.devices.map((device) => device.id), ["mac-1"]);
});

test("relay hides cross-account devices from attach, forward, and datagram requests", () => {
  const state = createRelayState();
  state.access.registry.tokens = [
    { name: "acct-1-agent", accountId: "acct_1", hash: hashToken("agent-1"), roles: ["agent"] },
    { name: "acct-2-agent", accountId: "acct_2", hash: hashToken("agent-2"), roles: ["agent"] },
    { name: "acct-1-client", accountId: "acct_1", hash: hashToken("client-1"), roles: ["client"] },
  ];
  const agentOne = fakeSocket();
  const agentTwo = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agentOne,
    serialize(envelope("hello", { role: "agent", token: "agent-1", device: { id: "mac-1" } })),
  );
  handleRelayMessage(
    state,
    agentTwo,
    serialize(envelope("hello", { role: "agent", token: "agent-2", device: { id: "mac-2" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "client-1" })));

  handleRelayMessage(
    state,
    client,
    serialize(envelope("session.attach.prepare", { id: "attach-1", deviceId: "mac-2", sessionName: "main" })),
  );
  handleRelayMessage(
    state,
    client,
    serialize(envelope("forward.open", { streamId: "stream-1", deviceId: "mac-2", remotePort: 22 })),
  );
  handleRelayMessage(
    state,
    client,
    serialize(envelope("datagram.open", { channelId: "dg-1", deviceId: "mac-2", label: "mosh" })),
  );

  assert.equal(agentTwo.messages.map(JSON.parse).some((message) => message.type === "session.attach.prepare"), false);
  assert.equal(agentTwo.messages.map(JSON.parse).some((message) => message.type === "forward.open"), false);
  assert.equal(agentTwo.messages.map(JSON.parse).some((message) => message.type === "datagram.open"), false);
  assert.equal(
    client.messages.map(JSON.parse).find((message) => message.type === "session.attach.error").message,
    "device offline",
  );
  assert.equal(
    client.messages.map(JSON.parse).find((message) => message.type === "forward.error").message,
    "device offline",
  );
  assert.equal(
    client.messages.map(JSON.parse).find((message) => message.type === "datagram.error").message,
    "device offline",
  );
});

test("relay routes attach prepare response back to requesting client", () => {
  const state = createRelayState({ token: "dev" });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(
    state,
    client,
    serialize(envelope("session.attach.prepare", { id: "req-1", deviceId: "mac-1", sessionName: "main", create: true })),
  );

  const forwarded = agent.messages.map(JSON.parse).find((message) => message.type === "session.attach.prepare");
  assert.equal(forwarded.id, "req-1");
  assert.equal(forwarded.create, true);

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("session.attach.ready", { requestId: "req-1", manifest: { sessionName: "main" } })),
  );

  const response = client.messages.map(JSON.parse).find((message) => message.type === "session.attach.ready");
  assert.equal(response.manifest.sessionName, "main");
});

test("relay routes scrollback fetch response back to requesting client", () => {
  const state = createRelayState({ token: "dev" });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(
    state,
    client,
    serialize(envelope("session.scrollback.fetch", { id: "scroll-1", deviceId: "mac-1", sessionName: "main" })),
  );

  const forwarded = agent.messages.map(JSON.parse).find((message) => message.type === "session.scrollback.fetch");
  assert.equal(forwarded.id, "scroll-1");

  handleRelayMessage(
    state,
    agent,
    serialize(
      envelope("session.scrollback.ready", {
        requestId: "scroll-1",
        sessionName: "main",
        lines: 10,
        text: "hello\n",
      }),
    ),
  );

  const response = client.messages.map(JSON.parse).find((message) => message.type === "session.scrollback.ready");
  assert.equal(response.text, "hello\n");
});

test("relay routes datagram channel messages", () => {
  const state = createRelayState({ token: "dev" });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(
    state,
    client,
    serialize(envelope("datagram.open", { channelId: "dg-1", deviceId: "mac-1", label: "mosh" })),
  );

  const open = agent.messages.map(JSON.parse).find((message) => message.type === "datagram.open");
  assert.equal(open.channelId, "dg-1");
  assert.equal(state.datagrams.has("dg-1"), true);

  handleRelayMessage(state, agent, serialize(envelope("datagram.ready", { channelId: "dg-1" })));
  handleRelayMessage(state, agent, serialize(envelope("datagram.data", { channelId: "dg-1", data: "cGluZw==", sequence: 1 })));

  const ready = client.messages.map(JSON.parse).find((message) => message.type === "datagram.ready");
  const data = client.messages.map(JSON.parse).find((message) => message.type === "datagram.data");
  assert.equal(ready.channelId, "dg-1");
  assert.equal(data.data, "cGluZw==");

  handleRelayMessage(state, client, serialize(envelope("datagram.close", { channelId: "dg-1" })));
  assert.equal(state.datagrams.has("dg-1"), false);
});

test("relay closes datagram channels when a peer disconnects", () => {
  const state = createRelayState({ token: "dev" });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(state, client, serialize(envelope("datagram.open", { channelId: "dg-peer", deviceId: "mac-1" })));

  agent.readyState = 3;
  assert.equal(sweepStaleDatagrams(state), 1);
  assert.equal(state.datagrams.has("dg-peer"), false);

  const close = client.messages.map(JSON.parse).find((message) => message.type === "datagram.close");
  assert.equal(close.channelId, "dg-peer");
});

test("relay sweeps idle datagram channels without leaking relay state", () => {
  const state = createRelayState({ token: "dev", datagramTimeoutMs: 1000 });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(state, client, serialize(envelope("datagram.open", { channelId: "dg-idle", deviceId: "mac-1" })));

  state.datagrams.get("dg-idle").lastSeenMs = 1000;
  assert.equal(sweepStaleDatagrams(state, 2501), 1);
  assert.equal(state.datagrams.has("dg-idle"), false);
  assert.equal(state.metrics.staleDatagramsPruned, 1);

  const clientClose = client.messages.map(JSON.parse).find((message) => message.type === "datagram.close");
  const agentClose = agent.messages.map(JSON.parse).find((message) => message.type === "datagram.close");
  assert.equal(clientClose.channelId, "dg-idle");
  assert.equal(agentClose.channelId, "dg-idle");
});

test("relay reports datagram offline errors", () => {
  const state = createRelayState({ token: "dev" });
  const client = fakeSocket();

  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(
    state,
    client,
    serialize(envelope("datagram.open", { channelId: "dg-1", deviceId: "offline" })),
  );

  const error = client.messages.map(JSON.parse).find((message) => message.type === "datagram.error");
  assert.equal(error.channelId, "dg-1");
  assert.equal(error.message, "device offline");
});

test("relay returns scrollback offline errors for missing devices", () => {
  const state = createRelayState({ token: "dev" });
  const client = fakeSocket();

  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  handleRelayMessage(
    state,
    client,
    serialize(envelope("session.scrollback.fetch", { id: "scroll-1", deviceId: "offline", sessionName: "main" })),
  );

  const response = client.messages.map(JSON.parse).find((message) => message.type === "session.scrollback.error");
  assert.equal(response.requestId, "scroll-1");
  assert.equal(response.message, "device offline");
});

test("relay sweeps stale agents and updates clients", () => {
  const state = createRelayState({ token: "dev", deviceTimeoutMs: 1000 });
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1" } })),
  );
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));
  state.agents.get("mac-1").lastSeenMs = 1000;

  assert.equal(sweepStaleAgents(state, 3001), 1);
  assert.equal(state.agents.has("mac-1"), false);
  const snapshots = client.messages.map(JSON.parse).filter((message) => message.type === "devices.snapshot");
  assert.equal(snapshots.at(-1).devices.length, 0);
});

test("relay handles agent heartbeat without broadcasting session churn", () => {
  const state = createRelayState({ token: "dev" });
  const agent = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "dev", device: { id: "mac-1", capabilities: [] } })),
  );
  const before = state.agents.get("mac-1").lastSeenMs;
  handleRelayMessage(
    state,
    agent,
    serialize(envelope("agent.heartbeat", { deviceId: "mac-1", capabilities: ["tmux.sessions"] })),
  );

  assert.equal(state.agents.get("mac-1").device.capabilities[0], "tmux.sessions");
  assert.ok(state.agents.get("mac-1").lastSeenMs >= before);
});

test("relay status reports operational counts", () => {
  const state = createRelayState({ token: "dev" });
  const client = fakeSocket();
  handleRelayMessage(state, client, serialize(envelope("hello", { role: "client", token: "dev" })));

  const status = relayStatus(state);
  assert.equal(status.ok, true);
  assert.equal(status.clients, 1);
  assert.equal(status.agents, 0);
  assert.equal(status.metrics.messagesReceived, 1);
  assert.equal(status.metrics.authAccepted, 1);
});

test("relay returns structured invalid message errors", () => {
  const state = createRelayState({ token: "dev" });
  const client = fakeSocket();
  handleRelayMessage(state, client, JSON.stringify({ version: 1, type: "forward.data", streamId: "s", data: "bad!" }));

  const error = client.messages.map(JSON.parse).find((message) => message.type === "error");
  assert.equal(error.code, "invalid_message");
  assert.equal(error.field, "data");
  assert.equal(state.metrics.invalidMessages, 1);
});

function fakeSocket() {
  return {
    OPEN: 1,
    readyState: 1,
    closed: false,
    messages: [],
    send(message) {
      this.messages.push(message);
    },
    close() {
      this.closed = true;
      this.readyState = 3;
    },
  };
}
