import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { checkRelayReachability, runDoctor } from "../src/doctor.js";

test("runDoctor reports launchd service state without network checks", async () => {
  const report = await runDoctor({
    network: false,
    commandExistsFn: () => true,
    runTextFn: fakeGitIdentity,
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
  assert.equal(findItem(report, "relay reachability").message, "Skipped. Run `hovvi doctor --network` to connect to the configured relay.");
});

test("runDoctor checks configured relay only in network mode", async () => {
  const report = await runDoctor({
    network: true,
    commandExistsFn: () => true,
    runTextFn(command, args) {
      if (command === "gh") return ok("Logged in to github.com account Jaemani");
      if (command === "ssh") return ok("Hi Jaemani! You've successfully authenticated.");
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
  assert.deepEqual(findItem(report, "relay reachability"), {
    name: "relay reachability",
    status: "pass",
    message: "reachable",
    detail: "ws://token@example.test:8787",
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
