import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  formatScreenshotResult,
  parseIosSimulatorScreenshotArgs,
  writeScreenshotMetadata,
} from "../src/ios-simulator-screenshot-cli.js";

test("iOS simulator screenshot CLI parses artifact options", () => {
  const options = parseIosSimulatorScreenshotArgs([
    "--fixture=browsing",
    "--output=.artifacts/ios/shot.png",
    "--metadata=.artifacts/ios/shot.json",
    "--keep-screenshot",
    "--json",
    "--require-captured",
  ]);

  assert.deepEqual(options, {
    fixture: "browsing",
    outputPath: ".artifacts/ios/shot.png",
    metadataPath: ".artifacts/ios/shot.json",
    keepScreenshot: true,
    json: true,
    requireCaptured: true,
  });
});

test("iOS simulator screenshot CLI writes JSON metadata", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hovvi-ios-shot-meta-"));
  const metadataPath = path.join(dir, "nested", "shot.json");
  const result = {
    status: "captured",
    bundleId: "app.hovvi.mobile.alpha",
    fixture: "attached-coding-agent",
    image: { width: 10, height: 20, pixels: 200, uniqueColors: 4, nonBlank: true },
  };

  try {
    writeScreenshotMetadata(metadataPath, result);
    assert.deepEqual(JSON.parse(readFileSync(metadataPath, "utf8")), result);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("iOS simulator screenshot CLI formats captured, skipped, and failed results", () => {
  assert.deepEqual(
    formatScreenshotResult({
      status: "captured",
      bundleId: "app.hovvi.mobile.alpha",
      screenshot: "/tmp/shot.png",
      image: { width: 10, height: 20 },
    }),
    {
      stream: "stdout",
      text: "iOS simulator screenshot ready: 10x20 app.hovvi.mobile.alpha\n/tmp/shot.png",
    }
  );

  assert.deepEqual(formatScreenshotResult({ status: "skipped", reason: "no full Xcode" }), {
    stream: "stdout",
    text: "Skipping iOS simulator screenshot: no full Xcode",
  });

  assert.deepEqual(
    formatScreenshotResult({ status: "failed", reason: "blank", simctl: "simctl output" }),
    {
      stream: "stderr",
      text: "iOS simulator screenshot failed: blank\nsimctl output",
    }
  );
});
