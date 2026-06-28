import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("relay rejects agents for revoked account devices", () => {
  const state = createRelayState();
  state.access.registry.tokens = [
    { name: "mac-agent", accountId: "acct_1", hash: hashToken("agent-secret"), roles: ["agent"] },
  ];
  state.access.registry.devices = [
    { accountId: "acct_1", deviceId: "mac-1", disabled: true, disabledAt: "2026-06-24T00:00:00.000Z" },
  ];
  const agent = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "agent-secret", device: { id: "mac-1" } })),
  );

  assert.equal(agent.closed, true);
  assert.equal(state.agents.has("mac-1"), false);
  assert.equal(state.metrics.authRejected, 1);
  assert.equal(state.audit.recent().at(-1).reason, "device_revoked");
});

test("relay records account id for accepted registry auth without token material", () => {
  const state = createRelayState();
  state.access.registry.tokens = [
    { name: "acct-client", accountId: "acct_1", hash: hashToken("client-secret"), roles: ["client"] },
  ];
  const client = fakeSocket();

  handleRelayMessage(
    state,
    client,
    serialize(envelope("hello", { role: "client", token: "client-secret", clientId: "client-1" })),
  );

  const record = state.audit.recent().at(-1);
  assert.equal(record.type, "auth.accept");
  assert.equal(record.role, "client");
  assert.equal(record.subject, "acct-client");
  assert.equal(record.source, "registry");
  assert.equal(record.accountId, "acct_1");
  assert.equal(record.clientId, "client-1");
  assert.equal(JSON.stringify(record).includes("client-secret"), false);
  assert.equal(JSON.stringify(record).includes(hashToken("client-secret")), false);
  assert.equal(Object.hasOwn(record, "token"), false);
  assert.equal(Object.hasOwn(record, "hash"), false);
});

test("relay structured logs record operational metadata without payload or token material", () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-relay-log-"));
  const logPath = join(dir, "relay.jsonl");
  const state = createRelayState({ token: "dev", logPath });
  state.access.registry.tokens = [
    { name: "acct-agent", accountId: "acct_1", hash: hashToken("agent-secret"), roles: ["agent"] },
    { name: "acct-client", accountId: "acct_1", hash: hashToken("client-secret"), roles: ["client"] },
  ];
  const agent = fakeSocket();
  const client = fakeSocket();

  handleRelayMessage(
    state,
    agent,
    serialize(envelope("hello", { role: "agent", token: "agent-secret", device: { id: "mac-1" } })),
  );
  handleRelayMessage(
    state,
    client,
    serialize(envelope("hello", { role: "client", token: "client-secret", clientId: "ios-1" })),
  );
  handleRelayMessage(state, agent, serialize(envelope("sessions.update", { sessions: [{ name: "main" }] })));
  handleRelayMessage(state, client, serialize(envelope("datagram.open", { channelId: "dg-1", deviceId: "mac-1", label: "mosh" })));
  handleRelayMessage(state, agent, serialize(envelope("datagram.data", { channelId: "dg-1", data: "c2VjcmV0LXBheWxvYWQ=", sequence: 1 })));
  handleRelayMessage(state, client, serialize(envelope("datagram.close", { channelId: "dg-1" })));

  const entries = readJsonLines(logPath);
  const serialized = JSON.stringify(entries);
  assert.deepEqual(
    entries.map((entry) => entry.type),
    [
      "relay.auth.accept",
      "relay.agent.register",
      "relay.auth.accept",
      "relay.client.register",
      "relay.agent.sessions.update",
      "relay.datagram.open",
      "relay.datagram.close",
    ],
  );
  assert.equal(entries.find((entry) => entry.type === "relay.auth.accept" && entry.role === "client").accountId, "acct_1");
  assert.equal(entries.find((entry) => entry.type === "relay.datagram.open").maxDatagramBytes, undefined);
  assert.equal(serialized.includes("agent-secret"), false);
  assert.equal(serialized.includes("client-secret"), false);
  assert.equal(serialized.includes(hashToken("client-secret")), false);
  assert.equal(serialized.includes("c2VjcmV0LXBheWxvYWQ="), false);
  assert.equal(serialized.includes("secret-payload"), false);
  assert.equal(state.log.recent().length, entries.length);
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

test("relay rejects oversize client datagrams without forwarding them", () => {
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
    serialize(envelope("datagram.open", { channelId: "dg-limit", deviceId: "mac-1", maxDatagramBytes: 4 })),
  );
  handleRelayMessage(state, agent, serialize(envelope("datagram.ready", { channelId: "dg-limit" })));

  const agentMessageCount = agent.messages.length;
  handleRelayMessage(state, client, serialize(envelope("datagram.data", { channelId: "dg-limit", data: "aGVsbG8=" })));

  const clientError = client.messages.map(JSON.parse).find((message) => message.type === "datagram.error");
  const agentClose = agent.messages
    .slice(agentMessageCount)
    .map(JSON.parse)
    .find((message) => message.type === "datagram.close");
  assert.match(clientError.message, /datagram exceeds maxDatagramBytes \(5 > 4\)/);
  assert.equal(agentClose.channelId, "dg-limit");
  assert.equal(
    agent.messages
      .slice(agentMessageCount)
      .map(JSON.parse)
      .some((message) => message.type === "datagram.data"),
    false,
  );
  assert.equal(state.datagrams.has("dg-limit"), false);
});

test("relay rejects oversize agent datagrams without forwarding them", () => {
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
    serialize(envelope("datagram.open", { channelId: "dg-agent-limit", deviceId: "mac-1", maxDatagramBytes: 4 })),
  );
  handleRelayMessage(state, agent, serialize(envelope("datagram.ready", { channelId: "dg-agent-limit" })));

  const clientMessageCount = client.messages.length;
  handleRelayMessage(
    state,
    agent,
    serialize(envelope("datagram.data", { channelId: "dg-agent-limit", data: "aGVsbG8=", sequence: 1 })),
  );

  const agentError = agent.messages.map(JSON.parse).find((message) => message.type === "datagram.error");
  const clientClose = client.messages
    .slice(clientMessageCount)
    .map(JSON.parse)
    .find((message) => message.type === "datagram.close");
  assert.match(agentError.message, /datagram exceeds maxDatagramBytes \(5 > 4\)/);
  assert.equal(clientClose.channelId, "dg-agent-limit");
  assert.equal(
    client.messages
      .slice(clientMessageCount)
      .map(JSON.parse)
      .some((message) => message.type === "datagram.data"),
    false,
  );
  assert.equal(state.datagrams.has("dg-agent-limit"), false);
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

function readJsonLines(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
