import { redactUrlCredentials } from "./redaction.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function parseRelayUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["ws:", "wss:"].includes(url.protocol)) {
      return { ok: false, reason: "Relay URL must use ws:// or wss://." };
    }
    if (!url.hostname) {
      return { ok: false, reason: "Relay URL must include a host." };
    }
    return { ok: true, url };
  } catch (error) {
    return { ok: false, reason: `Relay URL is invalid: ${error.message}` };
  }
}

export function isLocalRelayUrl(rawUrl) {
  const parsed = parseRelayUrl(rawUrl);
  if (!parsed.ok) return false;
  return LOOPBACK_HOSTS.has(parsed.url.hostname.toLowerCase());
}

export function validateRelayUrl(rawUrl, { label = "Relay URL" } = {}) {
  const parsed = parseRelayUrl(rawUrl);
  if (!parsed.ok) {
    throw new Error(`${label} is invalid. ${parsed.reason}`);
  }
  return parsed.url.toString();
}

export function validateRelayCredentials({ relayUrl, token, label = "Relay credentials" } = {}) {
  const missing = [];
  if (!relayUrl) missing.push("relay URL");
  if (!token) missing.push("relay token");
  if (missing.length > 0) {
    throw new Error(
      `${label} missing ${missing.join(" and ")}. Run \`hovvi login --relay <url> --issue-token agent\` or \`hovvi service install --relay <url> --token <agent-token>\`.`,
    );
  }

  validateRelayUrl(relayUrl, { label: "Relay URL" });
  if (token === "dev" && !isLocalRelayUrl(relayUrl)) {
    throw new Error(
      `${label} cannot use development token "dev" with non-local relay ${redactUrlCredentials(relayUrl)}. Use an account-scoped relay token.`,
    );
  }
}

export function relayCredentialIssue({ relayUrl, token } = {}) {
  try {
    validateRelayCredentials({ relayUrl, token });
    return undefined;
  } catch (error) {
    return error.message;
  }
}
