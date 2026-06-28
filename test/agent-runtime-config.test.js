import test from "node:test";
import assert from "node:assert/strict";
import { resolveAgentRuntimeConfig } from "../src/agent-runtime-config.js";

test("agent runtime config resolves private config without manual flags", () => {
  const resolved = resolveAgentRuntimeConfig([], {
    env: {},
    config: {
      relay: {
        url: "wss://relay.example.test/hovvi",
        token: "agent-token",
      },
      device: {
        name: "Mac Studio",
      },
    },
  });

  assert.deepEqual(resolved, {
    relayUrl: "wss://relay.example.test/hovvi",
    token: "agent-token",
    name: "Mac Studio",
    heartbeatIntervalMs: 10000,
    publishIntervalMs: 5000,
    remaining: [],
  });
});

test("agent runtime config lets flags override private config", () => {
  const resolved = resolveAgentRuntimeConfig(
    [
      "--relay",
      "ws://127.0.0.1:8787",
      "--token",
      "dev",
      "--name",
      "CLI Mac",
      "--heartbeat-ms",
      "2500",
      "--publish-ms",
      "1500",
    ],
    {
      env: {},
      config: {
        relay: {
          url: "wss://relay.example.test",
          token: "agent-token",
        },
        device: {
          name: "Config Mac",
        },
      },
    },
  );

  assert.equal(resolved.relayUrl, "ws://127.0.0.1:8787");
  assert.equal(resolved.token, "dev");
  assert.equal(resolved.name, "CLI Mac");
  assert.equal(resolved.heartbeatIntervalMs, 2500);
  assert.equal(resolved.publishIntervalMs, 1500);
  assert.deepEqual(resolved.remaining, []);
});

test("agent runtime config rejects remote development token", () => {
  assert.throws(
    () =>
      resolveAgentRuntimeConfig([], {
        env: {},
        config: {
          relay: {
            url: "wss://relay.example.test",
            token: "dev",
          },
        },
      }),
    /cannot use development token "dev" with non-local relay/,
  );
});
