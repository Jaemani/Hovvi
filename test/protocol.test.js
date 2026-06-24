import test from "node:test";
import assert from "node:assert/strict";
import { envelope, parseEnvelope, PROTOCOL_VERSION, serialize } from "../src/protocol.js";

test("envelope includes protocol version and type", () => {
  const message = envelope("devices.list", { id: "fixed" });
  assert.equal(message.version, PROTOCOL_VERSION);
  assert.equal(message.type, "devices.list");
  assert.equal(message.id, "fixed");
});

test("parseEnvelope rejects unsupported versions", () => {
  assert.throws(() => parseEnvelope(JSON.stringify({ version: 999, type: "x" })), /Unsupported/);
});

test("serialize and parse round-trip", () => {
  const message = envelope("hello", { role: "client", token: "dev" });
  const parsed = parseEnvelope(serialize(message));
  assert.equal(parsed.type, "hello");
  assert.equal(parsed.role, "client");
});

test("envelope flattens message payload fields", () => {
  const message = envelope("devices.snapshot", { devices: [{ id: "dev_1" }] });
  assert.equal(Object.hasOwn(message, "payload"), false);
  assert.deepEqual(message.devices, [{ id: "dev_1" }]);
});
