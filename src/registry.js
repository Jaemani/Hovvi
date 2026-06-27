import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
        accountId: match.accountId,
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

export function loadRegistry(registryPath) {
  if (!registryPath || !existsSync(registryPath)) return {};
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

export function saveRegistry(registryPath, registry) {
  if (!registryPath) throw new Error("Registry path is required.");
  const dir = dirname(registryPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tempPath = join(dir, `.registry.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tempPath, `${JSON.stringify(normalizeRegistry(registry), null, 2)}\n`, { mode: 0o600 });
  chmodSync(tempPath, 0o600);
  renameSync(tempPath, registryPath);
  chmodSync(registryPath, 0o600);
}

export function listRegistryTokens(registry) {
  return [...(Array.isArray(registry.tokens) ? registry.tokens : [])].map((entry) => ({
    name: entry.name,
    accountId: entry.accountId,
    roles: entry.roles || ["agent", "client"],
    disabled: Boolean(entry.disabled),
    deviceIds: entry.deviceIds,
    clientIds: entry.clientIds,
    notBefore: entry.notBefore,
    expiresAt: entry.expiresAt,
    disabledAt: entry.disabledAt,
  }));
}

export function listRegistryAccounts(registry) {
  return [...(Array.isArray(registry.accounts) ? registry.accounts : [])].map((account) => ({
    accountId: account.accountId,
    name: account.name,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }));
}

export function listRegistryDevices(registry, { accountId } = {}) {
  return [...(Array.isArray(registry.devices) ? registry.devices : [])]
    .filter((device) => !accountId || device.accountId === accountId)
    .map((device) => ({
      accountId: device.accountId,
      deviceId: device.deviceId,
      name: device.name,
      platform: device.platform,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    }));
}

export function upsertRegistryAccount(registry, { accountId, name, now = new Date() } = {}) {
  if (!accountId) throw new Error("Account id is required.");
  const accounts = ensureArray(registry, "accounts");
  const existing = accounts.find((account) => account.accountId === accountId);
  if (existing) {
    if (name !== undefined) existing.name = name;
    existing.updatedAt = now.toISOString();
    return existing;
  }
  const account = {
    accountId,
    name,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  accounts.push(account);
  return account;
}

export function upsertRegistryDevice(registry, { accountId, deviceId, name, platform, now = new Date() } = {}) {
  if (!accountId) throw new Error("Account id is required.");
  if (!deviceId) throw new Error("Device id is required.");
  const devices = ensureArray(registry, "devices");
  const existing = devices.find((device) => device.accountId === accountId && device.deviceId === deviceId);
  if (existing) {
    if (name !== undefined) existing.name = name;
    if (platform !== undefined) existing.platform = platform;
    existing.updatedAt = now.toISOString();
    return existing;
  }
  const device = {
    accountId,
    deviceId,
    name,
    platform,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  devices.push(device);
  return device;
}

export function revokeRegistryToken(registry, { name, hash, now = new Date() } = {}) {
  if (!name && !hash) throw new Error("Token name or hash is required.");
  const tokens = Array.isArray(registry.tokens) ? registry.tokens : [];
  const entry = tokens.find((token) => (name ? token.name === name : token.hash === hash));
  if (!entry) return null;
  entry.disabled = true;
  entry.disabledAt = now.toISOString();
  return entry;
}

function normalizeRegistry(registry) {
  return {
    ...registry,
    accounts: Array.isArray(registry.accounts) ? registry.accounts : [],
    devices: Array.isArray(registry.devices) ? registry.devices : [],
    tokens: Array.isArray(registry.tokens) ? registry.tokens : [],
  };
}

function ensureArray(registry, key) {
  if (!Array.isArray(registry[key])) registry[key] = [];
  return registry[key];
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
