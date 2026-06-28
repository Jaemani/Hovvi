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

  return {
    status: failures.length === 0 ? "captured" : "failed",
    simulator: install.simulator,
    fixtures,
    results,
    failureCount: failures.length,
    reason:
      failures.length === 0
        ? undefined
        : `${failures.length} iOS simulator screenshot fixture(s) failed.`,
  };
}

export function safeFixtureName(fixture) {
  return String(fixture)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
