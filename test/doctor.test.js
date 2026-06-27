import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRelayReachability, runDoctor } from "../src/doctor.js";

test("runDoctor reports launchd service state without network checks", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "ws://relay.example.test:8787", token: "agent-secret-token" } }),
    configPathFn: () => join(tmpdir(), "hovvi-missing-test-config", "config.json"),
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  assert.equal(report.ok, true);
  assert.deepEqual(findItem(report, "launchd service"), {
    name: "launchd service",
    status: "pass",
    message: "loaded",
    detail: "dev.hovvi.agent",
  });
  assert.deepEqual(findItem(report, "relay config"), {
    name: "relay config",
    status: "pass",
    message: "configured",
    detail: "relay=ws://relay.example.test:8787/ token=present",
  });
  assert.doesNotMatch(JSON.stringify(report), /agent-secret-token/);
  assert.equal(findItem(report, "private config directory").message, "not found");
  assert.equal(findItem(report, "private config file").message, "not found");
  assert.equal(findItem(report, "relay reachability").message, "Skipped. Run `hovvi doctor --network` to connect to the configured relay.");
});

test("runDoctor warns when private relay config is incomplete", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "ws://relay.example.test:8787" } }),
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: false, detail: "not loaded" }),
  });

  assert.equal(report.ok, true);
  assert.deepEqual(findItem(report, "relay config"), {
    name: "relay config",
    status: "warn",
    message: "incomplete",
    detail:
      "Missing relay token in private config. Run `hovvi login --relay <url> --issue-token agent` or `hovvi service install --relay <url> --token <agent-token>` before starting the LaunchAgent.",
  });
});

test("runDoctor passes private config file with owner-only permissions", async () => {
  const path = tempConfigFile({ fileMode: 0o600, dirMode: 0o700 });
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "wss://relay.example.test", token: "secret" } }),
    configPathFn: () => path,
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  const item = findItem(report, "private config file");
  assert.equal(item.status, "pass");
  assert.equal(item.message, "private");
  assert.match(item.detail, /mode=0600/);
});

test("runDoctor warns when private config file is group or world readable", async () => {
  const path = tempConfigFile({ fileMode: 0o644, dirMode: 0o700 });
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "wss://relay.example.test", token: "secret" } }),
    configPathFn: () => path,
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  const item = findItem(report, "private config file");
  assert.equal(item.status, "warn");
  assert.equal(item.message, "permissions too broad");
  assert.match(item.detail, /mode=0644/);
  assert.match(item.detail, /chmod 600/);
});

test("runDoctor passes private config directory with owner-only permissions", async () => {
  const path = tempConfigFile({ fileMode: 0o600, dirMode: 0o700 });
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "wss://relay.example.test", token: "secret" } }),
    configPathFn: () => path,
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  const item = findItem(report, "private config directory");
  assert.equal(item.status, "pass");
  assert.equal(item.message, "private");
  assert.match(item.detail, /mode=0700/);
});

test("runDoctor warns when private config directory is group or world searchable", async () => {
  const path = tempConfigFile({ fileMode: 0o600, dirMode: 0o755 });
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "wss://relay.example.test", token: "secret" } }),
    configPathFn: () => path,
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  const item = findItem(report, "private config directory");
  assert.equal(item.status, "warn");
  assert.equal(item.message, "permissions too broad");
  assert.match(item.detail, /mode=0755/);
  assert.match(item.detail, /chmod 700/);
});

test("runDoctor redacts relay URL credentials in relay config diagnostics", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "wss://user:pass@relay.example.test/hovvi", token: "super-secret-token" } }),
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  const serialized = JSON.stringify(report);
  assert.deepEqual(findItem(report, "relay config"), {
    name: "relay config",
    status: "pass",
    message: "configured",
    detail: "relay=wss://%5Bredacted%5D:%5Bredacted%5D@relay.example.test/hovvi token=present",
  });
  assert.doesNotMatch(serialized, /super-secret-token|user:pass/);
});

test("runDoctor reports unreadable private relay config without network checks", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => {
      throw new Error("invalid JSON");
    },
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  assert.equal(report.ok, true);
  assert.deepEqual(findItem(report, "relay config"), {
    name: "relay config",
    status: "warn",
    message: "could not read config",
    detail: "invalid JSON",
  });
});

test("runDoctor checks configured relay only in network mode", async () => {
  const report = await runDoctor({
    network: true,
    commandExistsFn: () => true,
    runTextFn(command, args) {
      if (command === "gh") return ok("Logged in to github.com account Jaemani");
      if (command === "ssh") return ok("Hi Jaemani! You've successfully authenticated.");
      if (command.endsWith("socketfilterfw")) return ok("Firewall is disabled. (State = 0)");
      return fakeGitIdentity(command, args);
    },
    getConfigFn: () => ({ relay: { url: "ws://token@example.test:8787" } }),
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: false, detail: "not loaded" }),
    relayReachabilityFn: async (relayUrl) => ({
      name: "relay reachability",
      status: "pass",
      message: "reachable",
      detail: relayUrl,
    }),
  });

  assert.equal(report.ok, true);
  assert.equal(findItem(report, "launchd service").status, "warn");
  assert.deepEqual(findItem(report, "macOS firewall"), {
    name: "macOS firewall",
    status: "pass",
    message: "disabled",
    detail: "Firewall is disabled. (State = 0)",
  });
  assert.deepEqual(findItem(report, "relay reachability"), {
    name: "relay reachability",
    status: "pass",
    message: "reachable",
    detail: "ws://token@example.test:8787",
  });
  assert.deepEqual(findItem(report, "github account consistency"), {
    name: "github account consistency",
    status: "pass",
    message: "matched as Jaemani",
    detail: undefined,
  });
});

test("runDoctor warns when GitHub CLI and SSH accounts differ", async () => {
  const report = await runDoctor({
    network: true,
    commandExistsFn: () => true,
    runTextFn(command, args) {
      if (command === "gh") return ok("Logged in to github.com account Jaemani");
      if (command === "ssh") return ok("Hi other-user! You've successfully authenticated.");
      if (command.endsWith("socketfilterfw")) return ok("Firewall is disabled. (State = 0)");
      return fakeGitIdentity(command, args);
    },
    getConfigFn: () => ({ relay: { url: "ws://relay.example.test:8787" } }),
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
    relayReachabilityFn: async (relayUrl) => ({
      name: "relay reachability",
      status: "pass",
      message: "reachable",
      detail: relayUrl,
    }),
  });

  assert.equal(report.ok, true);
  assert.deepEqual(findItem(report, "github account consistency"), {
    name: "github account consistency",
    status: "warn",
    message: "gh and SSH accounts differ",
    detail: "gh=Jaemani ssh=other-user",
  });
});

test("runDoctor warns when macOS firewall is enabled", async () => {
  const report = await runDoctor({
    network: true,
    commandExistsFn: () => true,
    runTextFn(command, args) {
      if (command === "gh") return ok("Logged in to github.com account Jaemani");
      if (command === "ssh") return ok("Hi Jaemani! You've successfully authenticated.");
      if (command.endsWith("socketfilterfw")) return ok("Firewall is enabled. (State = 1)");
      return fakeGitIdentity(command, args);
    },
    getConfigFn: () => ({ relay: { url: "ws://relay.example.test:8787" } }),
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
    relayReachabilityFn: async (relayUrl) => ({
      name: "relay reachability",
      status: "pass",
      message: "reachable",
      detail: relayUrl,
    }),
  });

  const firewall = findItem(report, "macOS firewall");
  assert.equal(report.ok, true);
  assert.equal(firewall.status, "warn");
  assert.equal(firewall.message, "enabled");
  assert.match(firewall.detail, /local mosh-server UDP/);
});

test("runDoctor skips macOS firewall state outside network mode", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn(command, args) {
      assert.notEqual(command, "/usr/libexec/ApplicationFirewall/socketfilterfw");
      return fakeGitIdentity(command, args);
    },
    platformFn: () => "darwin",
    serviceStatusFn: () => ({ label: "dev.hovvi.agent", loaded: true, detail: "loaded" }),
  });

  assert.equal(findItem(report, "macOS firewall"), undefined);
  assert.match(findItem(report, "github network checks").message, /firewall state/);
});

test("runDoctor warns when launchd service is loaded but unhealthy", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    platformFn: () => "darwin",
    serviceStatusFn: () => ({
      label: "dev.hovvi.agent",
      loaded: true,
      detail: "state = waiting\nlast exit code = 78",
      launchctl: {
        state: "waiting",
        lastExitCode: 78,
        throttleInterval: 10,
        healthy: false,
      },
    }),
  });

  assert.deepEqual(findItem(report, "launchd service"), {
    name: "launchd service",
    status: "warn",
    message: "loaded but unhealthy",
    detail: "dev.hovvi.agent state=waiting lastExitCode=78 throttleInterval=10s",
  });
});

test("runDoctor warns when LaunchAgent uses a different config path", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
    getConfigFn: () => ({ relay: { url: "wss://relay.example.test", token: "secret" } }),
    configPathFn: () => "/Users/me/.hovvi/config.json",
    platformFn: () => "darwin",
    serviceStatusFn: () => ({
      label: "dev.hovvi.agent",
      loaded: true,
      configPath: "/tmp/hovvi-test/config.json",
      launchctl: {
        state: "running",
        healthy: true,
      },
    }),
  });

  assert.deepEqual(findItem(report, "launchd service"), {
    name: "launchd service",
    status: "warn",
    message: "loaded with different config",
    detail: "dev.hovvi.agent config=/tmp/hovvi-test/config.json state=running",
  });
});

test("checkRelayReachability redacts URL credentials", async () => {
  const result = await checkRelayReachability("ws://user:secret@example.test:8787", {
    WebSocketClass: OpenWebSocket,
    timeoutMs: 100,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.detail, "ws://%5Bredacted%5D:%5Bredacted%5D@example.test:8787/");
});

test("checkRelayReachability reports unreachable relays without throwing", async () => {
  const result = await checkRelayReachability("ws://example.test:8787", {
    WebSocketClass: ErrorWebSocket,
    timeoutMs: 100,
  });

  assert.equal(result.status, "warn");
  assert.equal(result.message, "unreachable");
  assert.match(result.detail, /connection refused/);
});

function findItem(report, name) {
  return report.items.find((item) => item.name === name);
}

function fakeGitIdentity(command, args) {
  if (command === "git" && args.join(" ") === "config --get user.name") return ok("Jaemani");
  if (command === "git" && args.join(" ") === "config --get user.email") return ok("jaemani@example.com");
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

function tempConfigFile({ fileMode, dirMode }) {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-doctor-config-mode-"));
  const path = join(dir, "config.json");
  mkdirSync(dir, { recursive: true, mode: dirMode });
  chmodSync(dir, dirMode);
  writeFileSync(path, "{}\n", { mode: fileMode });
  chmodSync(path, fileMode);
  return path;
}

class OpenWebSocket extends EventEmitter {
  constructor() {
    super();
    queueMicrotask(() => this.emit("open"));
  }

  close() {}
}

class ErrorWebSocket extends EventEmitter {
  constructor() {
    super();
    queueMicrotask(() => this.emit("error", new Error("connection refused")));
  }

  close() {}
}
