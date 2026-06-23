import test from "node:test";
import assert from "node:assert/strict";
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
