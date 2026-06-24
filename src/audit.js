import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_LIMIT = 200;

export function createAuditSink({ path, limit = DEFAULT_LIMIT, now = () => new Date() } = {}) {
  const events = [];

  return {
    record(event) {
      const entry = sanitizeEvent({
        at: now().toISOString(),
        ...event,
      });
      events.push(entry);
      if (events.length > limit) events.splice(0, events.length - limit);
      if (path) appendJsonLine(path, entry);
      return entry;
    },
    recent() {
      return [...events];
    },
  };
}

function appendJsonLine(path, entry) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function sanitizeEvent(event) {
  const clean = {};
  for (const [key, value] of Object.entries(event)) {
    if (value === undefined) continue;
    if (key.toLowerCase().includes("token")) continue;
    clean[key] = value;
  }
  return clean;
}
