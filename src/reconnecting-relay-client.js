import { createClient } from "./relay-client.js";

export function createReconnectingClient({
  relayUrl,
  token,
  maxConnectAttempts = 3,
  initialBackoffMs = 100,
  maxBackoffMs = 1000,
} = {}) {
  let client;
  let closed = false;

  async function getClient() {
    if (closed) throw new Error("reconnecting relay client is closed");
    if (client) return client;
    client = await connectWithBackoff({
      relayUrl,
      token,
      maxConnectAttempts,
      initialBackoffMs,
      maxBackoffMs,
    });
    return client;
  }

  function reset() {
    const previous = client;
    client = undefined;
    previous?.close?.();
  }

  async function run(operation) {
    const active = await getClient();
    try {
      return await operation(active);
    } catch (error) {
      if (isRelayDisconnectError(error)) reset();
      throw error;
    }
  }

  return {
    devices: () => client?.devices?.() || [],
    close() {
      closed = true;
      reset();
    },
    listDevices(options) {
      return run((active) => active.listDevices(options));
    },
    openDatagram(options) {
      return run((active) => active.openDatagram(options));
    },
    openForward(options) {
      return run((active) => active.openForward(options));
    },
    prepareAttach(options) {
      return run((active) => active.prepareAttach(options));
    },
    prepareMoshDatagramAttach(options) {
      return run((active) => active.prepareMoshDatagramAttach(options));
    },
    fetchScrollback(options) {
      return run((active) => active.fetchScrollback(options));
    },
  };
}

async function connectWithBackoff({
  relayUrl,
  token,
  maxConnectAttempts,
  initialBackoffMs,
  maxBackoffMs,
}) {
  let lastError;
  for (let attempt = 1; attempt <= maxConnectAttempts; attempt += 1) {
    try {
      return await createClient({ relayUrl, token });
    } catch (error) {
      lastError = error;
      if (attempt === maxConnectAttempts) break;
      const backoffMs = Math.min(maxBackoffMs, initialBackoffMs * 2 ** (attempt - 1));
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

function isRelayDisconnectError(error) {
  return /relay client (is closed|disconnected)/.test(error?.message || "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
