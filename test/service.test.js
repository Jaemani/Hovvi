import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { saveConfig } from "../src/config.js";
import { redactSecrets } from "../src/redaction.js";
import {
  buildLaunchAgentPlist,
  formatServiceStatus,
  parseLaunchAgentConfigPath,
  parseLaunchctlPrint,
  validateLaunchAgentConfigPath,
} from "../src/service.js";

test("launchd plist includes agent command and config-only environment", () => {
  const plist = buildLaunchAgentPlist({
    label: "dev.hovvi.agent",
    nodePath: "/usr/local/bin/node",
    binPath: "/usr/local/bin/hovvi",
    configPath: "/Users/me/.hovvi/config.json",
    relayUrl: "wss://relay.example.com",
    token: "secret",
    name: "Mac",
    stdoutPath: "/Users/me/.hovvi/logs/agent.out.log",
    stderrPath: "/Users/me/.hovvi/logs/agent.err.log",
  });

  assert.match(plist, /<string>dev\.hovvi\.agent<\/string>/);
  assert.match(plist, /<string>\/usr\/local\/bin\/hovvi<\/string>/);
  assert.match(plist, /<key>HOVVI_CONFIG<\/key>/);
  assert.match(plist, /<string>\/Users\/me\/\.hovvi\/config\.json<\/string>/);
  assert.doesNotMatch(plist, /HOVVI_RELAY_URL/);
  assert.doesNotMatch(plist, /HOVVI_RELAY_TOKEN/);
  assert.doesNotMatch(plist, /secret/);
  assert.match(plist, /<key>KeepAlive<\/key>/);
});

test("launchd plist config path parser reads escaped HOVVI_CONFIG", () => {
  const plist = buildLaunchAgentPlist({
    label: "dev.hovvi.agent",
    nodePath: "/usr/local/bin/node",
    binPath: "/usr/local/bin/hovvi",
    configPath: "/Users/me/Hovvi & Test/config.json",
    stdoutPath: "/Users/me/.hovvi/logs/agent.out.log",
    stderrPath: "/Users/me/.hovvi/logs/agent.err.log",
  });

  assert.equal(parseLaunchAgentConfigPath(plist), "/Users/me/Hovvi & Test/config.json");
});

test("service install requires configured relay credentials", async () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-service-missing-config-"));
  process.env.HOVVI_CONFIG = join(dir, "config.json");

  try {
    await assert.rejects(
      () => captureStdout(() => main(["service", "install", "--print"])),
      /service install requires --relay <url>/,
    );

    saveConfig({ relay: { url: "wss://relay.example.test/hovvi" } });
    await assert.rejects(
      () => captureStdout(() => main(["service", "install", "--print"])),
      /service install requires --token <agent-token>/,
    );
  } finally {
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
});

test("service install print reuses private config without exposing relay token", async () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-service-config-print-"));
  const configPath = join(dir, "config.json");
  process.env.HOVVI_CONFIG = configPath;

  try {
    saveConfig({
      relay: {
        url: "wss://relay.example.test/hovvi",
        token: "agent-secret-token",
      },
      device: {
        name: "MacBook",
      },
    });

    const plist = await captureStdout(() => main(["service", "install", "--print"]));
    assert.match(plist, new RegExp(configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(plist, /agent-secret-token/);
    assert.doesNotMatch(plist, /relay\.example\.test/);
    assert.doesNotMatch(plist, /HOVVI_RELAY_TOKEN|HOVVI_RELAY_URL/);
  } finally {
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
});

test("service log redaction removes relay tokens, URL credentials, and mosh keys", () => {
  const redacted = redactSecrets(
    [
      "HOVVI_RELAY_TOKEN=secret-token",
      "relay=wss://user:pass@relay.example.com/path",
      "Authorization: Bearer gho_secret",
      'message {"token":"registry-secret"}',
      "MOSH CONNECT 60001 abcdefghijklmnopqrstuv",
    ].join("\n"),
  );

  assert.doesNotMatch(redacted, /secret-token/);
  assert.doesNotMatch(redacted, /user:pass/);
  assert.doesNotMatch(redacted, /gho_secret/);
  assert.doesNotMatch(redacted, /registry-secret/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuv/);
  assert.match(redacted, /HOVVI_RELAY_TOKEN=\[redacted\]/);
  assert.match(redacted, /wss:\/\/%5Bredacted%5D:%5Bredacted%5D@relay\.example\.com\/path/);
  assert.match(redacted, /MOSH CONNECT 60001 \[redacted\]/);
});

test("launchctl print parser extracts lifecycle failure diagnostics", () => {
  const parsed = parseLaunchctlPrint(
    [
      "state = waiting",
      "pid = 4321",
      "last exit code = 78",
      "last termination reason = namespace SIGNAL, code 15 Terminated",
      "throttle interval = 10",
    ].join("\n"),
  );

  assert.deepEqual(parsed, {
    state: "waiting",
    pid: 4321,
    lastExitCode: 78,
    lastTerminationReason: "namespace SIGNAL, code 15 Terminated",
    throttleInterval: 10,
    healthy: false,
  });
});

test("service status formatter summarizes launchd lifecycle state", () => {
  const summary = formatServiceStatus({
    configPath: "/Users/me/.hovvi/config.json",
    launchctl: {
      state: "running",
      pid: 123,
      lastExitCode: 0,
      throttleInterval: 10,
    },
  });

  assert.equal(summary, "config=/Users/me/.hovvi/config.json state=running pid=123 lastExitCode=0 throttleInterval=10s");
});

test("service start preflight rejects missing LaunchAgent config path", () => {
  assert.throws(
    () =>
      validateLaunchAgentConfigPath({
        activeConfigPath: "/Users/me/.hovvi/config.json",
        launchAgentConfigPath: undefined,
        plistPath: "/Users/me/Library/LaunchAgents/dev.hovvi.agent.plist",
      }),
    /LaunchAgent plist is missing HOVVI_CONFIG/,
  );
});

test("service start preflight rejects LaunchAgent config drift", () => {
  assert.throws(
    () =>
      validateLaunchAgentConfigPath({
        activeConfigPath: "/Users/me/.hovvi/config.json",
        launchAgentConfigPath: "/tmp/hovvi/config.json",
        plistPath: "/Users/me/Library/LaunchAgents/dev.hovvi.agent.plist",
      }),
    /LaunchAgent plist uses a different HOVVI_CONFIG/,
  );
});

test("service start preflight accepts matching LaunchAgent config path", () => {
  assert.doesNotThrow(() =>
    validateLaunchAgentConfigPath({
      activeConfigPath: "/Users/me/.hovvi/config.json",
      launchAgentConfigPath: "/Users/me/.hovvi/config.json",
      plistPath: "/Users/me/Library/LaunchAgents/dev.hovvi.agent.plist",
    }),
  );
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
