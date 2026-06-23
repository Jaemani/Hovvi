import test from "node:test";
import assert from "node:assert/strict";
import { isAiCommand, parseTmuxPaneLine, parseTmuxSessionLine } from "../src/sessions.js";

test("parseTmuxSessionLine maps tmux fields", () => {
  const session = parseTmuxSessionLine("$0\tmain\t1\t3\t1710000000\t1710000300");
  assert.deepEqual(session, {
    id: "$0",
    name: "main",
    attached: true,
    windows: 3,
    createdAt: 1710000000,
    lastActivityAt: 1710000300,
  });
});

test("parseTmuxPaneLine marks AI panes", () => {
  const pane = parseTmuxPaneLine("main\tdev\t%1\tcodex\t/Users/jaeman/Codes/Hovvi\tcodex");
  assert.equal(pane.sessionName, "main");
  assert.equal(pane.command, "codex");
  assert.equal(pane.ai, true);
});

test("isAiCommand handles binary paths and ordinary shells", () => {
  assert.equal(isAiCommand("/opt/homebrew/bin/claude"), true);
  assert.equal(isAiCommand("zsh"), false);
});
