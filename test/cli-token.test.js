import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { hashToken, loadRegistry, saveRegistry } from "../src/registry.js";

test("token list and revoke manage registry files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-token-"));
  const registryPath = join(dir, "registry.json");
  saveRegistry(registryPath, {
    tokens: [
      {
        name: "phone",
        hash: hashToken("secret"),
        roles: ["client"],
        clientIds: ["ios-1"],
      },
    ],
  });

  const listOutput = await captureStdout(() => main(["token", "list", "--registry", registryPath, "--json"]));
  assert.equal(JSON.parse(listOutput).tokens[0].name, "phone");

  const revokeOutput = await captureStdout(() => main(["token", "revoke", "--registry", registryPath, "--name", "phone"]));
  assert.match(revokeOutput, /Revoked phone/);
  assert.equal(loadRegistry(registryPath).tokens[0].disabled, true);
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
