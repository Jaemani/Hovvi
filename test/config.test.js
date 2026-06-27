import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath, getConfig, saveConfig } from "../src/config.js";

test("saveConfig writes private config files and repairs loose modes", () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-config-"));
  const path = join(dir, "config.json");
  process.env.HOVVI_CONFIG = path;

  try {
    saveConfig({ relay: { token: "secret" } });

    assert.equal(configPath(), path);
    assert.equal(fileMode(path), 0o600);
    assert.equal(getConfig().relay.token, "secret");

    chmodSync(path, 0o644);
    saveConfig({ relay: { token: "new-secret" } });

    assert.equal(fileMode(path), 0o600);
    assert.equal(getConfig().relay.token, "new-secret");
  } finally {
    if (previousConfig === undefined) {
      delete process.env.HOVVI_CONFIG;
    } else {
      process.env.HOVVI_CONFIG = previousConfig;
    }
  }
});

test("saveConfig repairs loose default config directory mode", () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const previousHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "hovvi-home-"));
  const dir = join(home, ".hovvi");
  process.env.HOME = home;
  delete process.env.HOVVI_CONFIG;

  try {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    chmodSync(dir, 0o755);

    saveConfig({ relay: { token: "secret" } });

    assert.equal(configPath(), join(dir, "config.json"));
    assert.equal(fileMode(dir), 0o700);
    assert.equal(fileMode(configPath()), 0o600);
    assert.equal(getConfig().relay.token, "secret");
  } finally {
    restoreEnv("HOVVI_CONFIG", previousConfig);
    restoreEnv("HOME", previousHome);
  }
});

test("saveConfig leaves existing custom config directory mode unchanged", () => {
  const previousConfig = process.env.HOVVI_CONFIG;
  const dir = mkdtempSync(join(tmpdir(), "hovvi-custom-config-"));
  const path = join(dir, "config.json");
  process.env.HOVVI_CONFIG = path;

  try {
    chmodSync(dir, 0o755);

    saveConfig({ relay: { token: "secret" } });

    assert.equal(fileMode(dir), 0o755);
    assert.equal(fileMode(path), 0o600);
    assert.equal(getConfig().relay.token, "secret");
  } finally {
    restoreEnv("HOVVI_CONFIG", previousConfig);
  }
});

function fileMode(path) {
  return statSync(path).mode & 0o777;
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
