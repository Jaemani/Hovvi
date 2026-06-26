import test from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/redaction.js";
import { buildLaunchAgentPlist } from "../src/service.js";

test("launchd plist includes agent command and environment", () => {
  const plist = buildLaunchAgentPlist({
    label: "dev.hovvi.agent",
    nodePath: "/usr/local/bin/node",
    binPath: "/usr/local/bin/hovvi",
    configPath: "/Users/me/.hovvi/config.json",
    relayUrl: "wss://relay.example.com",
    token: "secret",
    name: "Mac",
    stdoutPath: "/Users/me/.hovvi/logs/agent.out.log",
    stderrPath: "/Users/me/.hovvi/logs/agent.err.log",
  });

  assert.match(plist, /<string>dev\.hovvi\.agent<\/string>/);
  assert.match(plist, /<string>\/usr\/local\/bin\/hovvi<\/string>/);
  assert.match(plist, /<key>HOVVI_RELAY_URL<\/key>/);
  assert.match(plist, /<string>wss:\/\/relay\.example\.com<\/string>/);
  assert.match(plist, /<key>KeepAlive<\/key>/);
});

test("service log redaction removes relay tokens, URL credentials, and mosh keys", () => {
  const redacted = redactSecrets(
    [
      "HOVVI_RELAY_TOKEN=secret-token",
      "relay=wss://user:pass@relay.example.com/path",
      "Authorization: Bearer gho_secret",
      'message {"token":"registry-secret"}',
      "MOSH CONNECT 60001 abcdefghijklmnopqrstuv",
    ].join("\n"),
  );

  assert.doesNotMatch(redacted, /secret-token/);
  assert.doesNotMatch(redacted, /user:pass/);
  assert.doesNotMatch(redacted, /gho_secret/);
  assert.doesNotMatch(redacted, /registry-secret/);
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuv/);
  assert.match(redacted, /HOVVI_RELAY_TOKEN=\[redacted\]/);
  assert.match(redacted, /wss:\/\/%5Bredacted%5D:%5Bredacted%5D@relay\.example\.com\/path/);
  assert.match(redacted, /MOSH CONNECT 60001 \[redacted\]/);
});
