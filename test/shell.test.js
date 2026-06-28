import test from "node:test";
import assert from "node:assert/strict";
import { runText } from "../src/shell.js";

test("runText kills commands that exceed timeout", () => {
  const result = runText(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
    timeout: 50,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "ETIMEDOUT");
});
