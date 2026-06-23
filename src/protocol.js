import { validateMessage } from "./validation.js";

export const PROTOCOL_VERSION = 1;

export function envelope(type, payload = {}) {
  return {
    version: PROTOCOL_VERSION,
    type,
    id: payload.id || randomId(),
    sentAt: new Date().toISOString(),
    ...payload,
  };
}

export function randomId() {
  return cryptoRandom().replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
}

export function parseEnvelope(data) {
  const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
  const message = JSON.parse(text);
  if (message.version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${message.version}`);
  }
  if (!message.type || typeof message.type !== "string") {
    throw new Error("Protocol message requires a string type.");
  }
  return message;
}

export function parseAndValidateEnvelope(data) {
  const message = parseEnvelope(data);
  validateMessage(message);
  return message;
}

export function serialize(message) {
  return JSON.stringify(message);
}

function cryptoRandom() {
  const array = new Uint8Array(24);
  globalThis.crypto.getRandomValues(array);
  return Buffer.from(array).toString("base64url");
}
