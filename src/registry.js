import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export function createAccessRegistry({ devToken, registryPath } = {}) {
  const registry = loadRegistry(registryPath);

  return {
    authenticate({ role, token }) {
      if (!token) return null;
      const tokenEntries = Array.isArray(registry.tokens) ? registry.tokens : [];

      const match = tokenEntries.find((entry) => {
        if (entry.disabled) return false;
        if (!entry.hash || entry.hash !== hashToken(token)) return false;
        const roles = entry.roles || ["agent", "client"];
        return roles.includes(role) || roles.includes("*");
      });
      if (match) {
        return {
          subject: match.name || "registry-token",
          roles: match.roles || ["agent", "client"],
          source: "registry",
        };
      }

      if (devToken && token === devToken) {
        return {
          subject: "dev-token",
          roles: ["agent", "client"],
          source: "dev",
        };
      }

      return null;
    },
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
