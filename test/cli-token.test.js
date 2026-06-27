import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
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
  const auditPath = join(dir, "audit.jsonl");

  const output = await captureStdout(() =>
    main([
      "token",
      "generate",
      "--registry",
      registryPath,
      "--audit-log",
      auditPath,
      "--name",
      "jaeman-iphone",
      "--role",
      "client",
      "--account",
      "acct_1",
      "--client",
      "ios-1,ios-2",
      "--expires-at",
      "2999-07-01T00:00:00.000Z",
    ]),
  );
  const generated = JSON.parse(output);
  const stored = loadRegistry(registryPath).tokens[0];
  const auditEntry = readAuditEntries(auditPath)[0];

  assert.match(generated.token, /^hovvi_/);
  assert.equal(stored.name, "jaeman-iphone");
  assert.equal(stored.accountId, "acct_1");
  assert.deepEqual(stored.roles, ["client"]);
  assert.deepEqual(stored.clientIds, ["ios-1", "ios-2"]);
  assert.equal(stored.expiresAt, "2999-07-01T00:00:00.000Z");
  assert.equal(stored.hash, generated.registryEntry.hash);
  assert.equal(auditEntry.type, "registry.token.generate");
  assert.equal(auditEntry.name, "jaeman-iphone");
  assert.equal(auditEntry.accountId, "acct_1");
  assert.equal(JSON.stringify(auditEntry).includes(generated.token), false);
  assert.equal(JSON.stringify(auditEntry).includes(stored.hash), false);

  const listOutput = await captureStdout(() => main(["token", "list", "--registry", registryPath]));
  assert.match(listOutput, /jaeman-iphone active roles=client account=acct_1 clients=ios-1,ios-2 expires=2999-07-01T00:00:00.000Z/);
});

test("token list filters registry entries without exposing token hashes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-token-filter-"));
  const registryPath = join(dir, "registry.json");
  saveRegistry(registryPath, {
    tokens: [
      {
        name: "mac-active",
        hash: hashToken("agent-secret"),
        roles: ["agent"],
        accountId: "acct_1",
        deviceIds: ["mac-1", "mac-2"],
      },
      {
        name: "phone-active",
        hash: hashToken("client-secret"),
        roles: ["client"],
        accountId: "acct_1",
        clientIds: ["ios-1"],
      },
      {
        name: "mac-disabled",
        hash: hashToken("old-agent-secret"),
        roles: ["agent"],
        accountId: "acct_1",
        deviceIds: ["mac-1"],
        disabled: true,
        disabledAt: "2026-06-25T00:00:00.000Z",
      },
      {
        name: "other-account",
        hash: hashToken("other-secret"),
        roles: ["agent"],
        accountId: "acct_2",
        deviceIds: ["mac-1"],
      },
      {
        name: "phone-expired",
        hash: hashToken("expired-secret"),
        roles: ["client"],
        accountId: "acct_1",
        clientIds: ["ios-2"],
        expiresAt: "2000-01-01T00:00:00.000Z",
      },
      {
        name: "phone-pending",
        hash: hashToken("pending-secret"),
        roles: ["client"],
        accountId: "acct_1",
        clientIds: ["ios-3"],
        notBefore: "2999-01-01T00:00:00.000Z",
      },
    ],
  });

  const agentOutput = await captureStdout(() =>
    main([
      "token",
      "list",
      "--registry",
      registryPath,
      "--account",
      "acct_1",
      "--role",
      "agent",
      "--device",
      "mac-1",
      "--active",
      "--json",
    ]),
  );
  const agentTokens = JSON.parse(agentOutput).tokens;
  assert.deepEqual(agentTokens.map((token) => token.name), ["mac-active"]);
  assert.equal(Object.hasOwn(agentTokens[0], "hash"), false);
  assert.equal(JSON.stringify(agentTokens).includes("sha256:"), false);

  const clientOutput = await captureStdout(() =>
    main(["token", "list", "--registry", registryPath, "--client", "ios-1", "--json"]),
  );
  assert.deepEqual(
    JSON.parse(clientOutput).tokens.map((token) => token.name),
    ["phone-active"],
  );

  const expiredOutput = await captureStdout(() =>
    main(["token", "list", "--registry", registryPath, "--status", "expired", "--json"]),
  );
  assert.deepEqual(JSON.parse(expiredOutput).tokens[0], {
    name: "phone-expired",
    accountId: "acct_1",
    roles: ["client"],
    disabled: false,
    status: "expired",
    clientIds: ["ios-2"],
    expiresAt: "2000-01-01T00:00:00.000Z",
  });

  const pendingOutput = await captureStdout(() =>
    main(["token", "list", "--registry", registryPath, "--status", "not-before"]),
  );
  assert.match(pendingOutput, /phone-pending not-before roles=client account=acct_1 clients=ios-3 notBefore=2999-01-01T00:00:00.000Z/);

  const disabledOutput = await captureStdout(() =>
    main(["token", "list", "--registry", registryPath, "--account", "acct_1", "--disabled"]),
  );
  assert.match(disabledOutput, /mac-disabled disabled roles=agent account=acct_1 devices=mac-1/);
  assert.doesNotMatch(disabledOutput, /mac-active/);

  await assert.rejects(
    () => captureStdout(() => main(["token", "list", "--registry", registryPath, "--active", "--disabled"])),
    /only one of --active, --disabled, or --status/,
  );

  await assert.rejects(
    () => captureStdout(() => main(["token", "list", "--registry", registryPath, "--status", "unknown"])),
    /--status must be one of/,
  );
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
  const auditPath = join(dir, "audit.jsonl");

  const upsertOutput = await captureStdout(() =>
    main([
      "account",
      "upsert",
      "--registry",
      registryPath,
      "--audit-log",
      auditPath,
      "--account",
      "acct_1",
      "--name",
      "Jaemani",
      "--json",
    ]),
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
  assert.equal(readAuditEntries(auditPath)[0].type, "registry.account.upsert");
});

test("device CLI upserts account-scoped devices and filters list output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-device-"));
  const registryPath = join(dir, "registry.json");
  const auditPath = join(dir, "audit.jsonl");

  await captureStdout(() =>
    main(["account", "upsert", "--registry", registryPath, "--account", "acct_1", "--name", "Jaemani"]),
  );
  await captureStdout(() =>
    main([
      "device",
      "upsert",
      "--registry",
      registryPath,
      "--audit-log",
      auditPath,
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

  const revokeOutput = await captureStdout(() =>
    main([
      "device",
      "revoke",
      "--registry",
      registryPath,
      "--audit-log",
      auditPath,
      "--account",
      "acct_1",
      "--device",
      "mac-1",
    ]),
  );
  assert.match(revokeOutput, /Revoked device mac-1 account=acct_1/);

  const revokedListOutput = await captureStdout(() =>
    main(["device", "list", "--registry", registryPath, "--account", "acct_1"]),
  );
  assert.match(revokedListOutput, /mac-1 disabled account=acct_1/);
  assert.equal(loadRegistry(registryPath).devices[0].disabled, true);
  assert.deepEqual(
    readAuditEntries(auditPath).map((entry) => entry.type),
    ["registry.device.upsert", "registry.device.revoke"],
  );
});

test("login can register GitHub account and device metadata in registry", async () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-login-registry-"));
  const configPath = join(dir, "config.json");
  const registryPath = join(dir, "registry.json");
  process.env.HOVVI_CONFIG = configPath;

  try {
    const output = await captureStdout(() =>
      main(
        [
          "login",
          "--client-id",
          "oauth-client-1",
          "--registry",
          registryPath,
          "--device",
          "mac-main",
          "--account-name",
          "Jaemani Labs",
          "--device-name",
          "Mac Studio",
          "--platform",
          "darwin",
        ],
        {
          githubDeviceLogin: async ({ clientId, onUserCode }) => {
            assert.equal(clientId, "oauth-client-1");
            onUserCode({ verificationUri: "https://github.com/login/device", userCode: "ABCD-EFGH" });
            return {
              accessToken: "gho_secret",
              user: { login: "Jaemani", id: 39300288 },
            };
          },
        },
      ),
    );

    const registry = loadRegistry(registryPath);
    assert.equal(registry.accounts[0].accountId, "github:39300288");
    assert.equal(registry.accounts[0].name, "Jaemani Labs");
    assert.equal(registry.devices[0].accountId, "github:39300288");
    assert.equal(registry.devices[0].deviceId, "mac-main");
    assert.equal(registry.devices[0].name, "Mac Studio");
    assert.equal(registry.devices[0].platform, "darwin");
    assert.match(output, /Logged in as Jaemani/);
    assert.match(output, /Registered account github:39300288/);
    assert.match(output, /Registered device mac-main/);
    assert.equal(output.includes("gho_secret"), false);
  } finally {
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
});

test("login can issue scoped client relay token into registry and private config", async () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-login-client-token-"));
  const configPath = join(dir, "config.json");
  const registryPath = join(dir, "registry.json");
  const auditPath = join(dir, "audit.jsonl");
  process.env.HOVVI_CONFIG = configPath;

  try {
    const output = await captureStdout(() =>
      main(
        [
          "login",
          "--client-id",
          "oauth-client-1",
          "--registry",
          registryPath,
          "--audit-log",
          auditPath,
          "--issue-token",
          "client",
          "--relay-client",
          "ios-main",
          "--token-name",
          "jaeman-ios",
          "--expires-at",
          "2026-07-01T00:00:00.000Z",
        ],
        {
          githubDeviceLogin: async () => ({
            accessToken: "gho_secret",
            user: { login: "Jaemani", id: 39300288 },
          }),
        },
      ),
    );

    const registry = loadRegistry(registryPath);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const tokenEntry = registry.tokens[0];
    const auditEntries = readAuditEntries(auditPath);

    assert.equal(tokenEntry.name, "jaeman-ios");
    assert.equal(tokenEntry.accountId, "github:39300288");
    assert.deepEqual(tokenEntry.roles, ["client"]);
    assert.deepEqual(tokenEntry.clientIds, ["ios-main"]);
    assert.equal(tokenEntry.expiresAt, "2026-07-01T00:00:00.000Z");
    assert.equal(tokenEntry.hash, hashToken(config.relay.token));
    assert.equal(config.relay.clientId, "ios-main");
    assert.match(config.relay.token, /^hovvi_/);
    assert.match(output, /Issued client relay token jaeman-ios and saved it to config/);
    assert.equal(output.includes(config.relay.token), false);
    assert.equal(output.includes("gho_secret"), false);
    assert.equal(JSON.stringify(auditEntries).includes(config.relay.token), false);
    assert.equal(JSON.stringify(auditEntries).includes(tokenEntry.hash), false);
    assert.deepEqual(
      auditEntries.map((entry) => entry.type),
      ["registry.account.upsert", "registry.token.generate"],
    );
  } finally {
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
});

test("login can issue device-scoped agent relay token into registry and private config", async () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-cli-login-agent-token-"));
  const configPath = join(dir, "config.json");
  const registryPath = join(dir, "registry.json");
  process.env.HOVVI_CONFIG = configPath;

  try {
    const output = await captureStdout(() =>
      main(
        [
          "login",
          "--client-id",
          "oauth-client-1",
          "--registry",
          registryPath,
          "--device",
          "mac-main",
          "--device-name",
          "Mac Studio",
          "--issue-token",
          "agent",
        ],
        {
          githubDeviceLogin: async () => ({
            accessToken: "gho_secret",
            user: { login: "Jaemani", id: 39300288 },
          }),
        },
      ),
    );

    const registry = loadRegistry(registryPath);
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const tokenEntry = registry.tokens[0];

    assert.equal(tokenEntry.name, "github:39300288:agent:mac-main");
    assert.equal(tokenEntry.accountId, "github:39300288");
    assert.deepEqual(tokenEntry.roles, ["agent"]);
    assert.deepEqual(tokenEntry.deviceIds, ["mac-main"]);
    assert.equal(tokenEntry.hash, hashToken(config.relay.token));
    assert.equal(Object.hasOwn(config.relay, "clientId"), false);
    assert.equal(config.device.id, "mac-main");
    assert.equal(config.device.name, "Mac Studio");
    assert.match(output, /Registered device mac-main/);
    assert.match(output, /Issued agent relay token github:39300288:agent:mac-main and saved it to config/);
    assert.equal(output.includes(config.relay.token), false);

    await assert.rejects(
      () =>
        captureStdout(() =>
          main(
            [
              "login",
              "--client-id",
              "oauth-client-1",
              "--registry",
              registryPath,
              "--device",
              "mac-main",
              "--issue-token",
              "agent",
            ],
            {
              githubDeviceLogin: async () => ({
                accessToken: "gho_other",
                user: { login: "Jaemani", id: 39300288 },
              }),
            },
          ),
        ),
      /Registry token already exists: github:39300288:agent:mac-main/,
    );
  } finally {
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
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

function readAuditEntries(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
