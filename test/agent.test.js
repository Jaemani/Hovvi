import test from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { buildDeviceCapabilities, connectAgent, formatAgentDisconnectError } from "../src/agent.js";
import { envelope, parseEnvelope, serialize } from "../src/protocol.js";

test("buildDeviceCapabilities includes cmux only when installed", () => {
  assert.deepEqual(
    buildDeviceCapabilities({ commandExistsFn: () => false }),
    ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram"],
  );

  assert.deepEqual(
    buildDeviceCapabilities({ commandExistsFn: (command) => command === "cmux" }),
    ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram", "cmux.sessions"],
  );
});

test("formatAgentDisconnectError redacts secrets before launchd writes stderr logs", () => {
  const message = formatAgentDisconnectError(
    new Error(
      "failed relay=wss://user:pass@relay.example.com/path token=hovvi-secret Authorization: Bearer bearer-secret MOSH_KEY=abcdefghijklmnopqrstuv",
    ),
  );

  assert.match(message, /^Agent disconnected: /);
  assert.doesNotMatch(message, /user:pass/);
  assert.doesNotMatch(message, /hovvi-secret/);
  assert.doesNotMatch(message, /bearer-secret/);
  assert.doesNotMatch(message, /abcdefghijklmnopqrstuv/);
  assert.match(message, /wss:\/\/%5Bredacted%5D:%5Bredacted%5D@relay\.example\.com\/path/);
  assert.match(message, /token=\[redacted\]/);
  assert.match(message, /Authorization: Bearer \[redacted\]/);
  assert.match(message, /MOSH_KEY=\[redacted\]/);
});

test("agent closes relay datagram bridges on relay datagram errors", async () => {
  const relay = await openTestRelay();
  let closeCount = 0;
  let sendDataCount = 0;
  let bridgeCreated = false;

  const agentDone = connectAgent({
    relayUrl: relay.url,
    token: "dev",
    device: { id: "mac-1", name: "Mac", capabilities: ["mosh.relay-datagram"] },
    publishIntervalMs: 60000,
    heartbeatIntervalMs: 60000,
    listSessionsFn: async () => [],
    createDatagramBridgeFn(options) {
      bridgeCreated = true;
      options.send("datagram.ready", { channelId: options.channelId });
      return {
        sendData() {
          sendDataCount += 1;
          return true;
        },
        close() {
          closeCount += 1;
          options.onClose();
        },
      };
    },
  });

  try {
    const ws = await relay.connection;
    await waitFor(() => relay.messages.some((message) => message.type === "hello"));

    ws.send(
      serialize(
        envelope("datagram.open", {
          channelId: "dg-error",
          deviceId: "mac-1",
          remoteHost: "127.0.0.1",
          remotePort: 60001,
          maxDatagramBytes: 1200,
        }),
      ),
    );
    await waitFor(() => bridgeCreated);

    ws.send(serialize(envelope("datagram.error", { channelId: "dg-error", message: "relay closed channel" })));
    await waitFor(() => closeCount === 1);

    ws.send(serialize(envelope("datagram.data", { channelId: "dg-error", data: Buffer.from("late").toString("base64") })));
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(sendDataCount, 0);
  } finally {
    await relay.close();
    await agentDone.catch(() => {});
  }
});

function openTestRelay() {
  const messages = [];
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  let resolveConnection;
  const connection = new Promise((resolve) => {
    resolveConnection = resolve;
  });
  wss.on("connection", (ws) => {
    resolveConnection(ws);
    ws.on("message", (data) => {
      messages.push(parseEnvelope(data));
    });
  });
  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      wss.off("error", reject);
      const address = wss.address();
      resolve({
        url: `ws://127.0.0.1:${address.port}`,
        connection,
        messages,
        close: () =>
          new Promise((closeResolve) => {
            for (const client of wss.clients) client.close();
            wss.close(closeResolve);
          }),
      });
    });
  });
}

async function waitFor(predicate, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition.");
}
