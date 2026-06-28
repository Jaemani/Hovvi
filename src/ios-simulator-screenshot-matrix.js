import path from "node:path";
import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import { captureInstalledIosSimulatorScreenshot } from "./ios-simulator-screenshot.js";
import { readPngStats } from "./png-image-stats.js";
import { runText } from "./shell.js";

export const DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES = [
  "browsing",
  "attached-coding-agent",
  "failed-attach",
  "capped-viewport",
];

export function iosSimulatorScreenshotMatrixCheck({
  fixtures = DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES,
  outputDir,
  requireDistinctImages = true,
  waitMs = 1000,
  installCheckFn = iosSimulatorInstallCheck,
  runTextFn = runText,
  readPngStatsFn = readPngStats,
  waitFn,
} = {}) {
  const install = installCheckFn();
  if (install.status !== "installed") {
    return install;
  }

  const results = fixtures.map((fixture) =>
    captureInstalledIosSimulatorScreenshot({
      install,
      fixture,
      outputPath: outputDir
        ? path.join(path.resolve(outputDir), `${safeFixtureName(fixture)}.png`)
        : undefined,
      keepScreenshot: Boolean(outputDir),
      waitMs,
      runTextFn,
      readPngStatsFn,
      waitFn,
    })
  );
  const failures = results.filter((result) => result.status !== "captured");
  const duplicateImageFailures =
    failures.length === 0 && requireDistinctImages ? findDuplicateImageFailures(results) : [];
  const failureCount = failures.length + duplicateImageFailures.length;

  return {
    status: failureCount === 0 ? "captured" : "failed",
    simulator: install.simulator,
    fixtures,
    results,
    duplicateImageFailures,
    failureCount,
    reason:
      failureCount === 0
        ? undefined
        : `${failureCount} iOS simulator screenshot fixture assertion(s) failed.`,
  };
}

export function safeFixtureName(fixture) {
  return String(fixture)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function findDuplicateImageFailures(results) {
  const seen = new Map();
  const failures = [];
  for (const result of results) {
    const hash = result.image?.sha256;
    if (!hash) {
      failures.push({
        fixture: result.fixture,
        reason: "Captured screenshot metadata did not include a PNG SHA-256 hash.",
      });
      continue;
    }
    const previous = seen.get(hash);
    if (previous) {
      failures.push({
        fixture: result.fixture,
        duplicateOf: previous.fixture,
        sha256: hash,
        reason: "Captured screenshot fixture matched a previous fixture image.",
      });
      continue;
    }
    seen.set(hash, result);
  }
  return failures;
}
