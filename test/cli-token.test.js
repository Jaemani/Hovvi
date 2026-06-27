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

test("token generate writes account-scoped registry entries when registry is provided", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-token-generate-"));
  const registryPath = join(dir, "registry.json");

  const output = await captureStdout(() =>
    main([
      "token",
      "generate",
      "--registry",
      registryPath,
      "--name",
      "jaeman-iphone",
      "--role",
      "client",
      "--account",
      "acct_1",
      "--client",
      "ios-1,ios-2",
      "--expires-at",
      "2026-07-01T00:00:00.000Z",
    ]),
  );
  const generated = JSON.parse(output);
  const stored = loadRegistry(registryPath).tokens[0];

  assert.match(generated.token, /^hovvi_/);
  assert.equal(stored.name, "jaeman-iphone");
  assert.equal(stored.accountId, "acct_1");
  assert.deepEqual(stored.roles, ["client"]);
  assert.deepEqual(stored.clientIds, ["ios-1", "ios-2"]);
  assert.equal(stored.expiresAt, "2026-07-01T00:00:00.000Z");
  assert.equal(stored.hash, generated.registryEntry.hash);

  const listOutput = await captureStdout(() => main(["token", "list", "--registry", registryPath]));
  assert.match(listOutput, /jaeman-iphone active roles=client account=acct_1 clients=ios-1,ios-2 expires=2026-07-01T00:00:00.000Z/);
});

test("token hash writes device-scoped agent entries and rejects duplicate names", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-token-hash-"));
  const registryPath = join(dir, "registry.json");

  await captureStdout(() =>
    main([
      "token",
      "hash",
      "agent-secret",
      "--registry",
      registryPath,
      "--name",
      "mac-agent",
      "--role",
      "agent",
      "--account",
      "acct_1",
      "--device",
      "mac-1",
      "--device",
      "mac-2",
      "--not-before",
      "2026-06-24T00:00:00.000Z",
    ]),
  );

  const stored = loadRegistry(registryPath).tokens[0];
  assert.equal(stored.name, "mac-agent");
  assert.equal(stored.accountId, "acct_1");
  assert.deepEqual(stored.deviceIds, ["mac-1", "mac-2"]);
  assert.equal(stored.notBefore, "2026-06-24T00:00:00.000Z");

  await assert.rejects(
    () =>
      captureStdout(() =>
        main([
          "token",
          "hash",
          "other-secret",
          "--registry",
          registryPath,
          "--name",
          "mac-agent",
        ]),
      ),
    /Registry token already exists: mac-agent/,
  );
});

test("account CLI upserts and lists registry accounts without token material", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-account-"));
  const registryPath = join(dir, "registry.json");

  const upsertOutput = await captureStdout(() =>
    main(["account", "upsert", "--registry", registryPath, "--account", "acct_1", "--name", "Jaemani", "--json"]),
  );
  const upserted = JSON.parse(upsertOutput).account;
  assert.equal(upserted.accountId, "acct_1");
  assert.equal(upserted.name, "Jaemani");

  const listOutput = await captureStdout(() => main(["account", "list", "--registry", registryPath, "--json"]));
  const accounts = JSON.parse(listOutput).accounts;
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].accountId, "acct_1");
  assert.equal(Object.hasOwn(accounts[0], "hash"), false);
  assert.equal(Object.hasOwn(accounts[0], "token"), false);
});

test("device CLI upserts account-scoped devices and filters list output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-device-"));
  const registryPath = join(dir, "registry.json");

  await captureStdout(() =>
    main(["account", "upsert", "--registry", registryPath, "--account", "acct_1", "--name", "Jaemani"]),
  );
  await captureStdout(() =>
    main([
      "device",
      "upsert",
      "--registry",
      registryPath,
      "--account",
      "acct_1",
      "--device",
      "mac-1",
      "--name",
      "Mac Studio",
      "--platform",
      "darwin",
    ]),
  );
  await captureStdout(() =>
    main(["device", "upsert", "--registry", registryPath, "--account", "acct_2", "--device", "mac-2"]),
  );

  const registry = loadRegistry(registryPath);
  assert.equal(registry.accounts[0].accountId, "acct_1");
  assert.equal(registry.devices[0].deviceId, "mac-1");
  assert.equal(registry.devices[0].platform, "darwin");

  const listOutput = await captureStdout(() =>
    main(["device", "list", "--registry", registryPath, "--account", "acct_1", "--json"]),
  );
  const devices = JSON.parse(listOutput).devices;
  assert.deepEqual(devices.map((device) => device.deviceId), ["mac-1"]);
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
