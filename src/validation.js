export function validateMessage(message) {
  requireObject(message, "message");
  requireString(message.type, "type");

  switch (message.type) {
    case "hello":
      requireOneOf(message.role, "role", ["agent", "client"]);
      requireString(message.token, "token");
      if (message.role === "agent") {
        requireObject(message.device, "device");
        requireString(message.device.id, "device.id");
        optionalString(message.device.name, "device.name");
      }
      optionalString(message.clientId, "clientId");
      return;
    case "sessions.update":
      requireArray(message.sessions, "sessions");
      return;
    case "devices.list":
      return;
    case "forward.open":
      requireString(message.streamId, "streamId");
      requireString(message.deviceId, "deviceId");
      optionalString(message.remoteHost, "remoteHost");
      optionalPort(message.remotePort, "remotePort");
      return;
    case "forward.ready":
    case "forward.end":
      requireString(message.streamId, "streamId");
      return;
    case "forward.error":
      requireString(message.streamId, "streamId");
      optionalString(message.message, "message");
      return;
    case "forward.data":
      requireString(message.streamId, "streamId");
      requireBase64(message.data, "data");
      return;
    case "datagram.open":
      requireString(message.channelId, "channelId");
      requireString(message.deviceId, "deviceId");
      optionalString(message.label, "label");
      optionalInteger(message.maxDatagramBytes, "maxDatagramBytes", { min: 1, max: 65507 });
      return;
    case "datagram.ready":
    case "datagram.close":
      requireString(message.channelId, "channelId");
      return;
    case "datagram.error":
      requireString(message.channelId, "channelId");
      optionalString(message.message, "message");
      return;
    case "datagram.data":
      requireString(message.channelId, "channelId");
      requireBase64(message.data, "data");
      optionalInteger(message.sequence, "sequence", { min: 0, max: Number.MAX_SAFE_INTEGER });
      return;
    case "session.attach.prepare":
      requireString(message.deviceId, "deviceId");
      optionalString(message.sessionName, "sessionName");
      optionalInteger(message.lines, "lines", { min: 1, max: 200000 });
      optionalBoolean(message.create, "create");
      return;
    case "session.attach.ready":
      requireString(message.requestId, "requestId");
      requireObject(message.manifest, "manifest");
      return;
    case "session.attach.error":
      requireString(message.requestId, "requestId");
      optionalString(message.message, "message");
      return;
    case "session.scrollback.fetch":
      requireString(message.deviceId, "deviceId");
      optionalString(message.sessionName, "sessionName");
      optionalInteger(message.lines, "lines", { min: 1, max: 50000 });
      return;
    case "session.scrollback.ready":
      requireString(message.requestId, "requestId");
      optionalString(message.sessionName, "sessionName");
      requireAnyString(message.text, "text");
      optionalInteger(message.lines, "lines", { min: 1, max: 50000 });
      return;
    case "session.scrollback.error":
      requireString(message.requestId, "requestId");
      optionalString(message.message, "message");
      return;
    case "agent.heartbeat":
      requireString(message.deviceId, "deviceId");
      optionalArray(message.capabilities, "capabilities");
      return;
    case "error":
      optionalString(message.code, "code");
      optionalString(message.field, "field");
      optionalString(message.message, "message");
      return;
    default:
      throw new ValidationError(`unknown message type ${message.type}`, "type");
  }
}

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${field} must be an object`, field);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`, field);
}

function optionalArray(value, field) {
  if (value === undefined) return;
  requireArray(value, field);
}

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`, field);
  }
}

function requireAnyString(value, field) {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }
}

function optionalString(value, field) {
  if (value === undefined) return;
  requireString(value, field);
}

function requireOneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${field} must be one of ${allowed.join(", ")}`, field);
  }
}

function optionalBoolean(value, field) {
  if (value === undefined) return;
  if (typeof value !== "boolean") throw new ValidationError(`${field} must be a boolean`, field);
}

function optionalInteger(value, field, { min, max }) {
  if (value === undefined) return;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ValidationError(`${field} must be an integer between ${min} and ${max}`, field);
  }
}

function optionalPort(value, field) {
  if (value === undefined) return;
  optionalInteger(Number(value), field, { min: 1, max: 65535 });
}

function requireBase64(value, field) {
  requireString(value, field);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ValidationError(`${field} must be base64`, field);
  }
}
