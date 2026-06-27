import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuditSink } from "../src/audit.js";

test("audit sink records bounded events and redacts token fields", () => {
  const audit = createAuditSink({ limit: 1, now: () => new Date("2026-06-24T00:00:00.000Z") });

  audit.record({ type: "auth.reject", relayToken: "secret", reason: "expired" });
  const entry = audit.record({ type: "auth.accept", subject: "client", tokenHash: "sha256:secret" });

  assert.equal(entry.at, "2026-06-24T00:00:00.000Z");
  assert.deepEqual(audit.recent(), [entry]);
  assert.equal(Object.hasOwn(entry, "relayToken"), false);
  assert.equal(Object.hasOwn(entry, "tokenHash"), false);
});

test("audit sink writes private jsonl files", () => {
  const dir = mkdtempSync(join(tmpdir(), "hovvi-audit-"));
  const path = join(dir, "relay.audit.jsonl");
  const audit = createAuditSink({ path, now: () => new Date("2026-06-24T00:00:00.000Z") });

  audit.record({ type: "auth.reject", token: "secret", reason: "unknown_token" });

  const lines = readFileSync(path, "utf8").trim().split("\n");
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.reason, "unknown_token");
  assert.equal(Object.hasOwn(entry, "token"), false);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});
