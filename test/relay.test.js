import test from "node:test";
import assert from "node:assert/strict";
import { createRelayState, handleRelayMessage } from "../src/relay.js";
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
