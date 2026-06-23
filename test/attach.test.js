import test from "node:test";
import assert from "node:assert/strict";
import { buildAttachManifest, escapeTmuxTarget, parseMoshConnectLine } from "../src/attach.js";

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

test("escapeTmuxTarget rejects control characters", () => {
  assert.equal(escapeTmuxTarget("main"), "main");
  assert.throws(() => escapeTmuxTarget("bad\nname"), /control characters/);
});

test("parseMoshConnectLine parses mosh-server bootstrap output", () => {
  assert.deepEqual(parseMoshConnectLine("MOSH CONNECT 60001 abcDEF+/=\n"), {
    port: 60001,
    key: "abcDEF+/=",
  });
  assert.equal(parseMoshConnectLine("nope"), null);
});
