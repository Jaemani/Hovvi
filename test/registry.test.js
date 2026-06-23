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
