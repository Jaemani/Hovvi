import test from "node:test";
import assert from "node:assert/strict";
import { envelope, parseAndValidateEnvelope, serialize } from "../src/protocol.js";
import { validateMessage, ValidationError } from "../src/validation.js";

test("validateMessage accepts supported relay messages", () => {
  assert.doesNotThrow(() =>
    validateMessage(envelope("hello", { role: "client", token: "dev", clientId: "client-1" })),
  );
  assert.doesNotThrow(() =>
    validateMessage(
      envelope("forward.open", {
        streamId: "stream-1",
        deviceId: "device-1",
        remoteHost: "127.0.0.1",
        remotePort: 22,
      }),
    ),
  );
});

test("validateMessage rejects malformed forward data", () => {
  assert.throws(
    () => validateMessage(envelope("forward.data", { streamId: "stream-1", data: "not base64!" })),
    ValidationError,
  );
});

test("parseAndValidateEnvelope validates after parsing", () => {
  const message = parseAndValidateEnvelope(
    serialize(envelope("session.attach.prepare", { deviceId: "device-1", sessionName: "main" })),
  );
  assert.equal(message.type, "session.attach.prepare");
});
