import test from "node:test";
import assert from "node:assert/strict";
import { readFlag, readOption, splitFlags } from "../src/flags.js";

test("readFlag removes boolean flags", () => {
  const args = ["--json", "doctor"];
  assert.equal(readFlag(args, "--json"), true);
  assert.deepEqual(args, ["doctor"]);
});

test("readOption removes option and value", () => {
  const args = ["--port", "8787", "--host", "127.0.0.1"];
  assert.equal(readOption(args, "--port"), "8787");
  assert.deepEqual(args, ["--host", "127.0.0.1"]);
});

test("splitFlags separates flags and positionals", () => {
  const { flags, positionals } = splitFlags(["attach", "--session", "main", "--json"]);
  assert.deepEqual(positionals, ["attach"]);
  assert.equal(flags.get("--session"), "main");
  assert.equal(flags.get("--json"), true);
});
