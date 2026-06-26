const REDACTED = "[redacted]";

export function redactUrlCredentials(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = REDACTED;
    if (url.password) url.password = REDACTED;
    return url.toString();
  } catch {
    return String(rawUrl).replace(/:\/\/[^@\s]+@/, `://${REDACTED}@`);
  }
}

export function redactSecrets(text) {
  return String(text)
    .replace(/(MOSH CONNECT\s+\d+\s+)[A-Za-z0-9+/]{22}/g, `$1${REDACTED}`)
    .replace(/(HOVVI_RELAY_TOKEN\s*=\s*)[^\s"'`]+/gi, `$1${REDACTED}`)
    .replace(/(HOVVI_RELAY_TOKEN["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, `$1${REDACTED}`)
    .replace(/((?:access_)?token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, `$1${REDACTED}`)
    .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`)
    .replace(/wss?:\/\/[^\s"'<>]+/gi, (match) => redactUrlCredentials(match));
}
