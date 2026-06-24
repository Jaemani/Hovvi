import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export function createAccessRegistry({ devToken, registryPath } = {}) {
  const registry = loadRegistry(registryPath);

  function authenticate({ role, token, deviceId, clientId, now }) {
    const result = authenticateDetailed({ role, token, deviceId, clientId, now });
    return result.ok ? result.principal : null;
  }

  function authenticateDetailed({ role, token, deviceId, clientId, now = new Date() }) {
    if (!token) return deny("missing_token");
    const tokenEntries = Array.isArray(registry.tokens) ? registry.tokens : [];

    let deniedReason = "unknown_token";
    const match = tokenEntries.find((entry) => {
      const result = evaluateEntry({ entry, role, token, deviceId, clientId, now });
      if (result.ok) return true;
      if (result.reason !== "hash_mismatch") deniedReason = result.reason;
      return false;
    });
    if (match) {
      return allow({
        subject: match.name || "registry-token",
        roles: match.roles || ["agent", "client"],
        source: "registry",
        expiresAt: match.expiresAt,
      });
    }

    if (devToken && token === devToken) {
      return allow({
        subject: "dev-token",
        roles: ["agent", "client"],
        source: "dev",
      });
    }

    return deny(deniedReason);
  }

  return {
    authenticate,
    authenticateDetailed,
    registry,
  };
}

export function hashToken(token) {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function loadRegistry(registryPath) {
  if (!registryPath || !existsSync(registryPath)) return {};
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

function evaluateEntry({ entry, role, token, deviceId, clientId, now }) {
  if (entry.disabled) return deny("disabled");
  if (!entry.hash || entry.hash !== hashToken(token)) return deny("hash_mismatch");

  const roles = entry.roles || ["agent", "client"];
  if (!roles.includes(role) && !roles.includes("*")) return deny("role_not_allowed");

  if (entry.notBefore) {
    const notBefore = parseRegistryDate(entry.notBefore);
    if (!notBefore) return deny("invalid_not_before");
    if (now < notBefore) return deny("not_before");
  }
  if (entry.expiresAt) {
    const expiresAt = parseRegistryDate(entry.expiresAt);
    if (!expiresAt) return deny("invalid_expires_at");
    if (now >= expiresAt) return deny("expired");
  }

  if (role === "agent" && Array.isArray(entry.deviceIds) && !entry.deviceIds.includes(deviceId)) {
    return deny("device_not_allowed");
  }
  if (role === "client" && Array.isArray(entry.clientIds) && !entry.clientIds.includes(clientId)) {
    return deny("client_not_allowed");
  }

  return allow();
}

function parseRegistryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function allow(principal) {
  return { ok: true, principal };
}

function deny(reason) {
  return { ok: false, reason };
}
