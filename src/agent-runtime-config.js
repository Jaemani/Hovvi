import { readOption } from "./flags.js";
import { validateRelayCredentials } from "./relay-credentials.js";

export function resolveAgentRuntimeConfig(args = [], { env = process.env, config = {} } = {}) {
  const remaining = [...args];
  const relayUrl =
    readOption(remaining, "--relay") ||
    env.HOVVI_RELAY_URL ||
    config.relay?.url ||
    "ws://127.0.0.1:8787";
  const token = readOption(remaining, "--token") || env.HOVVI_RELAY_TOKEN || config.relay?.token || "dev";
  const name = readOption(remaining, "--name") || env.HOVVI_DEVICE_NAME || config.device?.name;
  const heartbeatIntervalMs = numberOption({
    value: readOption(remaining, "--heartbeat-ms") || env.HOVVI_HEARTBEAT_MS,
    fallback: 10000,
    name: "heartbeat interval",
  });
  const publishIntervalMs = numberOption({
    value: readOption(remaining, "--publish-ms") || env.HOVVI_PUBLISH_MS,
    fallback: 5000,
    name: "publish interval",
  });

  validateRelayCredentials({ relayUrl, token, label: "Agent relay config" });
  return {
    relayUrl,
    token,
    name,
    heartbeatIntervalMs,
    publishIntervalMs,
    remaining,
  };
}

function numberOption({ value, fallback, name }) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Agent ${name} must be a positive number.`);
  }
  return parsed;
}
