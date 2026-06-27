import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function configPath() {
  return process.env.HOVVI_CONFIG || join(defaultConfigDir(), "config.json");
}

export function getConfig() {
  const path = configPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

export function saveConfig(config) {
  const path = configPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (dir === defaultConfigDir()) chmodSync(dir, 0o700);

  const tempPath = join(dir, `.config.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tempPath, 0o600);
  renameSync(tempPath, path);
  chmodSync(path, 0o600);
}

function defaultConfigDir() {
  return join(homedir(), ".hovvi");
}
