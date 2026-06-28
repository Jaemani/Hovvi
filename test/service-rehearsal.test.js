import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectAgent, getDevice } from "../src/agent.js";
import { resolveAgentRuntimeConfig } from "../src/agent-runtime-config.js";
import { main } from "../src/cli.js";
import { getConfig, saveConfig } from "../src/config.js";
import { runDoctor } from "../src/doctor.js";
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
    const doctor = await runDoctor({
      network: false,
      commandExistsFn: () => true,
      runTextFn: fakeGitIdentity,
      getConfigFn: getConfig,
      configPathFn: () => configPath,
      platformFn: () => "darwin",
      serviceStatusFn: () => ({
        label: "dev.hovvi.agent",
        loaded: true,
        configPath,
        launchctl: {
          state: "running",
          healthy: true,
        },
      }),
    });
    assert.equal(doctor.ok, true);
    assert.deepEqual(findDoctorItem(doctor, "relay config"), {
      name: "relay config",
      status: "pass",
      message: "configured",
      detail: `relay=${relay.url}/ token=present`,
    });
    assert.deepEqual(findDoctorItem(doctor, "private config directory"), {
      name: "private config directory",
      status: "pass",
      message: "private",
      detail: `${dir} mode=0700`,
    });
    assert.deepEqual(findDoctorItem(doctor, "private config file"), {
      name: "private config file",
      status: "pass",
      message: "private",
      detail: `${configPath} mode=0600`,
    });
    assert.deepEqual(findDoctorItem(doctor, "launchd service"), {
      name: "launchd service",
      status: "pass",
      message: "loaded",
      detail: `dev.hovvi.agent config=${configPath} state=running`,
    });
    assert.doesNotMatch(JSON.stringify(doctor), /agent-token/);

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

function findDoctorItem(report, name) {
  return report.items.find((item) => item.name === name);
}

function fakeGitIdentity(command, args) {
  if (command === "git" && args.join(" ") === "config --get user.name") return ok("Jaemani");
  if (command === "git" && args.join(" ") === "config --get user.email") {
    return ok("jaemani@example.com");
  }
  if (command === "git" && args.join(" ") === "var GIT_AUTHOR_IDENT") {
    return ok("Jaemani <jaemani@example.com> 1710000000 +0900");
  }
  return ok("");
}

function ok(text) {
  return {
    ok: true,
    status: 0,
    stdout: text,
    stderr: "",
    text,
  };
}

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
