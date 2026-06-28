import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import {
  HOVVI_IOS_BUNDLE_ID,
  HOVVI_IOS_SNAPSHOT_FIXTURE_KEY,
} from "./ios-simulator-launch.js";
import { readPngStats } from "./png-image-stats.js";
import { runText } from "./shell.js";

export function iosSimulatorScreenshotCheck({
  fixture = "attached-coding-agent",
  keepScreenshot = false,
  outputPath,
  waitMs = 1000,
  installCheckFn = iosSimulatorInstallCheck,
  runTextFn = runText,
  readPngStatsFn = readPngStats,
  tempDirFn = () => mkdtempSync(path.join(tmpdir(), "hovvi-ios-shot-")),
  waitFn = sleepSync,
} = {}) {
  const install = installCheckFn();
  if (install.status !== "installed") {
    return install;
  }

  const udid = install.simulator?.udid;
  if (!udid) {
    return {
      status: "failed",
      reason: "iOS simulator install check did not return a simulator UDID.",
      install,
    };
  }

  const launch = runTextFn(
    "xcrun",
    ["simctl", "launch", "--terminate-running-process", udid, HOVVI_IOS_BUNDLE_ID],
    {
      timeout: 120000,
      env: {
        ...process.env,
        [`SIMCTL_CHILD_${HOVVI_IOS_SNAPSHOT_FIXTURE_KEY}`]: fixture,
      },
    }
  );
  if (!launch.ok) {
    terminateApp(runTextFn, udid);
    return {
      status: "failed",
      reason: "Could not launch HovviMobileApp before simulator screenshot.",
      simulator: install.simulator,
      simctl: launch.text,
    };
  }

  const screenshotRoot = outputPath ? path.dirname(path.resolve(outputPath)) : tempDirFn();
  const screenshotPath = outputPath
    ? path.resolve(outputPath)
    : path.join(screenshotRoot, "hovvi-ios-screenshot.png");
  const preserveScreenshot = keepScreenshot || Boolean(outputPath);
  mkdirSync(screenshotRoot, { recursive: true });
  try {
    waitFn(waitMs);
    const screenshot = runTextFn(
      "xcrun",
      ["simctl", "io", udid, "screenshot", screenshotPath],
      { timeout: 120000 }
    );
    if (!screenshot.ok) {
      return {
        status: "failed",
        reason: "Could not capture an iOS simulator screenshot.",
        simulator: install.simulator,
        simctl: screenshot.text,
      };
    }

    const stats = readPngStatsFn(screenshotPath);
    if (!stats.nonBlank) {
      return {
        status: "failed",
        reason: "iOS simulator screenshot was blank.",
        simulator: install.simulator,
        screenshot: preserveScreenshot ? screenshotPath : undefined,
        image: stats,
      };
    }

    return {
      status: "captured",
      simulator: install.simulator,
      bundleId: HOVVI_IOS_BUNDLE_ID,
      fixture,
      screenshot: preserveScreenshot ? screenshotPath : undefined,
      image: stats,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: `Could not validate iOS simulator screenshot: ${error.message}`,
      simulator: install.simulator,
      screenshot: preserveScreenshot ? screenshotPath : undefined,
    };
  } finally {
    terminateApp(runTextFn, udid);
    if (!preserveScreenshot) {
      rmSync(screenshotRoot, { recursive: true, force: true });
    }
  }
}

function terminateApp(runTextFn, udid) {
  runTextFn("xcrun", ["simctl", "terminate", udid, HOVVI_IOS_BUNDLE_ID], { timeout: 30000 });
}

function sleepSync(ms) {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
