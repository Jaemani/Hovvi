import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectAgent, getDevice } from "../src/agent.js";
import { resolveAgentRuntimeConfig } from "../src/agent-runtime-config.js";
import { main } from "../src/cli.js";
import { getConfig, saveConfig } from "../src/config.js";
import { createRelayServer } from "../src/relay.js";
import { createClient } from "../src/relay-client.js";

test("config-only service rehearsal installs plist shape and appears in local relay", async () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-service-rehearsal-"));
  const configPath = join(dir, "config.json");
  process.env.HOVVI_CONFIG = configPath;

  const relay = createRelayServer({ token: "agent-token" });
  await relay.listen();

  let client;
  let agentDone;
  try {
    saveConfig({
      relay: {
        url: relay.url,
        token: "agent-token",
      },
      device: {
        id: "mac-rehearsal",
        name: "Mac Rehearsal",
      },
    });

    const plist = await captureStdout(() => main(["service", "install", "--print"]));
    assert.match(plist, /<key>HOVVI_CONFIG<\/key>/);
    assert.match(plist, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(plist, /agent-token/);
    assert.doesNotMatch(plist, new RegExp(relay.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const runtime = resolveAgentRuntimeConfig([], { env: {}, config: getConfig() });
    const device = getDevice();
    agentDone = connectAgent({
      ...runtime,
      device,
      publishIntervalMs: 60000,
      heartbeatIntervalMs: 60000,
      listSessionsFn: async () => [
        {
          name: "main",
          kind: "tmux",
          windows: 1,
          attached: false,
          aiPanes: [],
        },
      ],
    });

    client = await createClient({ relayUrl: relay.url, token: "agent-token" });
    await waitFor(async () => {
      const devices = await client.listDevices();
      return devices.some((candidate) => candidate.id === "mac-rehearsal");
    });

    const devices = await client.listDevices();
    const rehearsalDevice = devices.find((candidate) => candidate.id === "mac-rehearsal");
    assert.equal(rehearsalDevice.name, "Mac Rehearsal");
    assert.equal(rehearsalDevice.sessions[0].name, "main");
    assert.equal(rehearsalDevice.sessions[0].kind, "tmux");

    const saved = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(saved.relay.token, "agent-token");
    assert.equal(saved.device.id, "mac-rehearsal");
    assert.equal(saved.device.name, "Mac Rehearsal");
  } finally {
    client?.close();
    await relay.close();
    await agentDone?.catch(() => {});
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
});

async function captureStdout(fn) {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = (chunk, ...args) => {
    output += String(chunk);
    const callback = args.find((arg) => typeof arg === "function");
    callback?.();
    return true;
  };
  try {
    await fn();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition.");
}
