import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  buildAttachManifest,
  buildMoshServerCommand,
  escapeTmuxTarget,
  parseMoshConnectLine,
  startMoshServer,
} from "../src/attach.js";

test("buildAttachManifest describes mosh, relay fallback, and tmux scrollback", () => {
  const manifest = buildAttachManifest({
    device: { id: "dev_1", name: "Mac" },
    sessionName: "main",
    lines: 500,
  });

  assert.equal(manifest.kind, "mosh-tmux");
  assert.equal(manifest.sessionName, "main");
  assert.equal(manifest.methods[0].name, "mosh");
  assert.deepEqual(manifest.scrollback.command, ["tmux", "capture-pane", "-t", "main", "-p", "-S", "-500"]);
  assert.deepEqual(manifest.controlMode.command, ["tmux", "-CC", "attach-session", "-t", "main"]);
});

test("buildAttachManifest exposes relay datagram transport after mosh bootstrap", () => {
  const manifest = buildAttachManifest({
    device: { id: "dev_1", name: "Mac" },
    sessionName: "main",
    mosh: { port: 60001, key: "abcDEF+/=" },
  });

  assert.equal(manifest.methods[0].status, "available");
  assert.deepEqual(manifest.methods[0].transport, {
    kind: "relay-datagram",
    label: "mosh",
    remoteHost: "127.0.0.1",
    remotePort: 60001,
    key: "abcDEF+/=",
    maxDatagramBytes: 1200,
  });
});

test("escapeTmuxTarget rejects control characters", () => {
  assert.equal(escapeTmuxTarget("main"), "main");
  assert.throws(() => escapeTmuxTarget("bad\nname"), /control characters/);
});

test("buildMoshServerCommand builds tmux attach command", () => {
  assert.deepEqual(buildMoshServerCommand({ sessionName: "main", columns: 120, lang: "en_US.UTF-8" }), {
    command: "mosh-server",
    args: [
      "new",
      "-s",
      "-c",
      "120",
      "-l",
      "LANG=en_US.UTF-8",
      "--",
      "tmux",
      "attach-session",
      "-t",
      "main",
    ],
  });
});

test("parseMoshConnectLine parses mosh-server bootstrap output", () => {
  assert.deepEqual(parseMoshConnectLine("MOSH CONNECT 60001 abcDEF+/=\n"), {
    port: 60001,
    key: "abcDEF+/=",
  });
  assert.equal(parseMoshConnectLine("nope"), null);
});

test("startMoshServer resolves after MOSH CONNECT output", async () => {
  const child = fakeChild();
  const server = await startMoshServer({
    sessionName: "main",
    timeoutMs: 100,
    spawn(command, args) {
      assert.equal(command, "mosh-server");
      assert.equal(args.at(-1), "main");
      queueMicrotask(() => child.stdout.emit("data", Buffer.from("noise\nMOSH CONNECT 60002 key+/=\n")));
      return child;
    },
  });

  assert.equal(server.port, 60002);
  assert.equal(server.key, "key+/=");
  assert.equal(server.pid, 1234);
  assert.equal(server.process, child);
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 1234;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}
