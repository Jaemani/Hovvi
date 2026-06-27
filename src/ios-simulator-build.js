import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { iosSimulatorPreflight } from "./ios-preflight.js";
import { runText } from "./shell.js";

export function iosSimulatorBuildCheck({
  cwd = process.cwd(),
  keepDerivedData = false,
  preflightFn = iosSimulatorPreflight,
  runTextFn = runText,
  tempDirFn = () => mkdtempSync(path.join(tmpdir(), "hovvi-ios-sim-")),
  findAppBundleFn = findAppBundle,
} = {}) {
  const preflight = preflightFn();
  if (preflight.status !== "ready") {
    return {
      status: "skipped",
      reason: preflight.reason,
      preflight,
    };
  }

  const simulator = preflight.simulators?.[0];
  if (!simulator?.udid) {
    return {
      status: "skipped",
      reason: "iOS simulator preflight did not return a simulator UDID.",
      preflight,
    };
  }

  const derivedDataPath = tempDirFn();
  const packagePath = path.resolve(cwd, "apps/ios");
  const result = runTextFn(
    "xcodebuild",
    [
      "-scheme",
      "HovviMobileApp",
      "-destination",
      `id=${simulator.udid}`,
      "-derivedDataPath",
      derivedDataPath,
      "build",
    ],
    { cwd: packagePath, timeout: 120000 }
  );

  if (!result.ok) {
    maybeRemoveDerivedData(derivedDataPath, keepDerivedData);
    return {
      status: "failed",
      reason: "xcodebuild could not build HovviMobileApp for an iOS simulator.",
      simulator,
      derivedDataPath: keepDerivedData ? derivedDataPath : undefined,
      xcodebuild: result.text,
    };
  }

  const productsPath = path.join(derivedDataPath, "Build/Products");
  const appBundle = findAppBundleFn(productsPath, "HovviMobileApp.app");
  if (!appBundle) {
    maybeRemoveDerivedData(derivedDataPath, keepDerivedData);
    return {
      status: "failed",
      reason: "xcodebuild succeeded but HovviMobileApp.app was not found in derived data products.",
      simulator,
      derivedDataPath: keepDerivedData ? derivedDataPath : undefined,
      xcodebuild: result.text,
    };
  }

  const response = {
    status: "built",
    simulator,
    appBundle: keepDerivedData ? appBundle : path.basename(appBundle),
    derivedDataPath: keepDerivedData ? derivedDataPath : undefined,
  };
  maybeRemoveDerivedData(derivedDataPath, keepDerivedData);
  return response;
}

function maybeRemoveDerivedData(derivedDataPath, keepDerivedData) {
  if (keepDerivedData) {
    return;
  }
  rmSync(derivedDataPath, { recursive: true, force: true });
}

function findAppBundle(root, bundleName) {
  if (!existsSync(root)) {
    return null;
  }
  const entries = readdirSync(root);
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory() && entry === bundleName) {
      return fullPath;
    }
    if (stats.isDirectory()) {
      const nested = findAppBundle(fullPath, bundleName);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}
