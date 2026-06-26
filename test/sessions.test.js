import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySession,
  isAiCommand,
  isCmuxCommand,
  parseTmuxPaneLine,
  parseTmuxSessionLine,
} from "../src/sessions.js";

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
  assert.equal(pane.cmux, false);
});

test("isAiCommand handles binary paths and ordinary shells", () => {
  assert.equal(isAiCommand("/opt/homebrew/bin/claude"), true);
  assert.equal(isAiCommand("zsh"), false);
});

test("parseTmuxPaneLine marks cmux panes", () => {
  const pane = parseTmuxPaneLine("main\tdev\t%3\t/opt/homebrew/bin/cmux\t/Users/jaeman/Codes/Hovvi\tcmux");
  assert.equal(pane.command, "/opt/homebrew/bin/cmux");
  assert.equal(pane.ai, false);
  assert.equal(pane.cmux, true);
});

test("isCmuxCommand handles binary paths and ordinary shells", () => {
  assert.equal(isCmuxCommand("/opt/homebrew/bin/cmux"), true);
  assert.equal(isCmuxCommand("zsh"), false);
});

test("classifySession prioritizes cmux metadata before generic AI sessions", () => {
  assert.equal(classifySession({ cmuxPanes: [{ command: "cmux" }], aiPanes: [{ command: "claude" }] }), "cmux");
  assert.equal(classifySession({ aiPanes: [{ command: "codex" }] }), "ai-dev");
  assert.equal(classifySession(), "tmux");
});
