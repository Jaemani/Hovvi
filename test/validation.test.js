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
  assert.doesNotThrow(() =>
    validateMessage(
      envelope("datagram.open", {
        channelId: "dg-1",
        deviceId: "device-1",
        label: "mosh",
        maxDatagramBytes: 1200,
      }),
    ),
  );
  assert.doesNotThrow(() =>
    validateMessage(envelope("datagram.data", { channelId: "dg-1", data: "cGluZw==", sequence: 1 })),
  );
});

test("validateMessage rejects malformed forward data", () => {
  assert.throws(
    () => validateMessage(envelope("forward.data", { streamId: "stream-1", data: "not base64!" })),
    ValidationError,
  );
});

test("validateMessage rejects malformed datagrams", () => {
  assert.throws(
    () => validateMessage(envelope("datagram.data", { channelId: "dg-1", data: "not base64!" })),
    ValidationError,
  );
  assert.throws(
    () => validateMessage(envelope("datagram.open", { channelId: "dg-1", deviceId: "device-1", maxDatagramBytes: 70000 })),
    ValidationError,
  );
});

test("parseAndValidateEnvelope validates after parsing", () => {
  const message = parseAndValidateEnvelope(
    serialize(envelope("session.attach.prepare", { deviceId: "device-1", sessionName: "main" })),
  );
  assert.equal(message.type, "session.attach.prepare");
});

test("validateMessage accepts empty scrollback text", () => {
  assert.doesNotThrow(() =>
    validateMessage(
      envelope("session.scrollback.ready", {
        requestId: "req-1",
        sessionName: "main",
        lines: 10,
        text: "",
      }),
    ),
  );
});

test("validateMessage rejects oversized scrollback requests", () => {
  assert.throws(
    () => validateMessage(envelope("session.scrollback.fetch", { deviceId: "device-1", lines: 1000000 })),
    ValidationError,
  );
});
