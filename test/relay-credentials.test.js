import test from "node:test";
import assert from "node:assert/strict";
import {
  isLocalRelayUrl,
  relayCredentialIssue,
  validateRelayCredentials,
  validateRelayUrl,
} from "../src/relay-credentials.js";

test("relay URL validation accepts websocket URLs with hosts", () => {
  assert.equal(validateRelayUrl("ws://127.0.0.1:8787"), "ws://127.0.0.1:8787/");
  assert.equal(validateRelayUrl("wss://relay.example.test/hovvi"), "wss://relay.example.test/hovvi");
});

test("relay URL validation rejects non-websocket or malformed URLs", () => {
  assert.throws(() => validateRelayUrl("https://relay.example.test"), /ws:\/\/ or wss:\/\//);
  assert.throws(() => validateRelayUrl("://not-a-url"), /Relay URL is invalid/);
});

test("relay credential validation allows development token only on local relays", () => {
  assert.equal(isLocalRelayUrl("ws://localhost:8787"), true);
  assert.equal(isLocalRelayUrl("ws://127.0.0.1:8787"), true);
  assert.equal(isLocalRelayUrl("ws://[::1]:8787"), true);
  assert.doesNotThrow(() =>
    validateRelayCredentials({ relayUrl: "ws://127.0.0.1:8787", token: "dev" }),
  );
  assert.throws(
    () => validateRelayCredentials({ relayUrl: "wss://relay.example.test", token: "dev" }),
    /cannot use development token "dev" with non-local relay/,
  );
});

test("relay credential issues redact URL credentials", () => {
  const issue = relayCredentialIssue({
    relayUrl: "wss://user:pass@relay.example.test/hovvi",
    token: "dev",
  });

  assert.match(issue, /%5Bredacted%5D/);
  assert.match(issue, /relay\.example\.test/);
  assert.doesNotMatch(issue, /user:pass/);
});
