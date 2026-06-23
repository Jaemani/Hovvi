import test from "node:test";
import assert from "node:assert/strict";
import { createRelayState, handleRelayMessage, sweepStaleAgents } from "../src/relay.js";
import { envelope, serialize } from "../src/protocol.js";

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
