import test from "node:test";
import assert from "node:assert/strict";
import { localMoshHarnessPreflight, runLocalMoshServerHarness } from "../src/mosh-harness.js";
import { commandExists } from "../src/shell.js";

test("local mosh harness preflight reports missing dependencies", () => {
  const preflight = localMoshHarnessPreflight({
    commandExistsFn(command) {
      return command !== "mosh-server";
    },
  });

  assert.equal(preflight.ok, false);
  assert.deepEqual(preflight.missing, ["mosh-server"]);
});

test("local mosh harness starts mosh-server and prepares UDP relay bridge when dependencies exist", async (t) => {
  if (!commandExists("tmux") || !commandExists("mosh-server")) {
    return t.skip("tmux and mosh-server are required for the local mosh harness smoke.");
  }

  const sessionName = `hovvi-harness-${process.pid}-${Date.now()}`;
  const result = await runLocalMoshServerHarness({
    sessionName,
    create: true,
    timeoutMs: 5000,
    maxDatagramBytes: 1200,
  });

  try {
    assert.equal(result.ok, true);
    assert.equal(result.sessionName, sessionName);
    assert.equal(result.createdSession, true);
    assert.equal(Number.isInteger(result.mosh.port), true);
    assert.match(result.mosh.key, /^[A-Za-z0-9+/]{22}$/);
    assert.equal(result.datagram.ready, true);
    assert.equal(result.frames.some((frame) => frame.type === "datagram.ready"), true);
  } finally {
    await result.dispose();
  }
});
