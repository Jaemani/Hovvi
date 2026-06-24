import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, statSync } from "node:fs";
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

function fileMode(path) {
  return statSync(path).mode & 0o777;
}
