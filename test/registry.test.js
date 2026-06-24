import test from "node:test";
import assert from "node:assert/strict";
import { createAccessRegistry, hashToken } from "../src/registry.js";

test("registry authenticates hashed scoped tokens", () => {
  const token = "secret";
  const access = createAccessRegistry({
    registryPath: undefined,
  });
  access.registry.tokens = [{ name: "agent", hash: hashToken(token), roles: ["agent"] }];

  assert.equal(access.authenticate({ role: "agent", token }).subject, "agent");
  assert.equal(access.authenticate({ role: "client", token }), null);
});

test("registry falls back to dev token", () => {
  const access = createAccessRegistry({ devToken: "dev" });
  assert.equal(access.authenticate({ role: "client", token: "dev" }).subject, "dev-token");
  assert.equal(access.authenticate({ role: "client", token: "wrong" }), null);
});

test("registry rejects expired and not-yet-valid tokens with reasons", () => {
  const access = createAccessRegistry();
  access.registry.tokens = [
    {
      name: "expired",
      hash: hashToken("old"),
      roles: ["client"],
      expiresAt: "2026-01-01T00:00:00.000Z",
    },
    {
      name: "future",
      hash: hashToken("future"),
      roles: ["client"],
      notBefore: "2026-07-01T00:00:00.000Z",
    },
  ];
  const now = new Date("2026-06-24T00:00:00.000Z");

  assert.equal(access.authenticateDetailed({ role: "client", token: "old", now }).reason, "expired");
  assert.equal(access.authenticateDetailed({ role: "client", token: "future", now }).reason, "not_before");
});

test("registry binds agent and client tokens to registered ids", () => {
  const access = createAccessRegistry();
  access.registry.tokens = [
    {
      name: "mac-agent",
      hash: hashToken("agent-secret"),
      roles: ["agent"],
      deviceIds: ["mac-1"],
    },
    {
      name: "phone-client",
      hash: hashToken("client-secret"),
      roles: ["client"],
      clientIds: ["ios-1"],
    },
  ];

  assert.equal(
    access.authenticate({ role: "agent", token: "agent-secret", deviceId: "mac-1" }).subject,
    "mac-agent",
  );
  assert.equal(
    access.authenticateDetailed({ role: "agent", token: "agent-secret", deviceId: "mac-2" }).reason,
    "device_not_allowed",
  );
  assert.equal(
    access.authenticate({ role: "client", token: "client-secret", clientId: "ios-1" }).subject,
    "phone-client",
  );
  assert.equal(
    access.authenticateDetailed({ role: "client", token: "client-secret", clientId: "ios-2" }).reason,
    "client_not_allowed",
  );
});
