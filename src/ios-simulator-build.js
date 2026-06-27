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
  findBuildArtifactFn = findBuildArtifact,
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
  const artifact = findBuildArtifactFn(productsPath, ["HovviMobileApp.app", "HovviMobileApp"]);
  if (!artifact) {
    maybeRemoveDerivedData(derivedDataPath, keepDerivedData);
    return {
      status: "failed",
      reason: "xcodebuild succeeded but no HovviMobileApp simulator build artifact was found in derived data products.",
      simulator,
      derivedDataPath: keepDerivedData ? derivedDataPath : undefined,
      products: listProducts(productsPath),
    };
  }

  const response = {
    status: "built",
    simulator,
    artifact: keepDerivedData ? artifact : path.basename(artifact),
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

function findBuildArtifact(root, artifactNames) {
  if (!existsSync(root)) {
    return null;
  }
  const entries = readdirSync(root);
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (artifactNames.includes(entry)) {
      return fullPath;
    }
    if (stats.isDirectory()) {
      const nested = findBuildArtifact(fullPath, artifactNames);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function listProducts(root, limit = 30) {
  if (!existsSync(root)) {
    return [];
  }
  const found = [];
  walk(root, found, limit);
  return found;
}

function walk(root, found, limit) {
  if (found.length >= limit) {
    return;
  }
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isFile() || stats.isDirectory()) {
      found.push(fullPath);
    }
    if (stats.isDirectory()) {
      walk(fullPath, found, limit);
    }
    if (found.length >= limit) {
      return;
    }
  }
}
