import test from "node:test";
import assert from "node:assert/strict";
import { buildDeviceCapabilities, formatAgentDisconnectError } from "../src/agent.js";

test("buildDeviceCapabilities includes cmux only when installed", () => {
  assert.deepEqual(
    buildDeviceCapabilities({ commandExistsFn: () => false }),
    ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram"],
  );

  assert.deepEqual(
    buildDeviceCapabilities({ commandExistsFn: (command) => command === "cmux" }),
    ["tmux.sessions", "tmux.capture", "tcp.forward", "mosh.compat.target", "mosh.relay-datagram", "cmux.sessions"],
  );
});

test("formatAgentDisconnectError redacts secrets before launchd writes stderr logs", () => {
  const message = formatAgentDisconnectError(
    new Error(
      "failed relay=wss://user:pass@relay.example.com/path token=hovvi-secret Authorization: Bearer bearer-secret MOSH_KEY=abcdefghijklmnopqrstuv",
    ),
  );

  assert.match(message, /^Agent disconnected: /);
  assert.doesNotMatch(message, /user:pass/);
  assert.doesNotMatch(message, /hovvi-secret/);
  assert.doesNotMatch(message, /bearer-secret/);
  assert.doesNotMatch(message, /abcdefghijklmnopqrstuv/);
  assert.match(message, /wss:\/\/%5Bredacted%5D:%5Bredacted%5D@relay\.example\.com\/path/);
  assert.match(message, /token=\[redacted\]/);
  assert.match(message, /Authorization: Bearer \[redacted\]/);
  assert.match(message, /MOSH_KEY=\[redacted\]/);
});
