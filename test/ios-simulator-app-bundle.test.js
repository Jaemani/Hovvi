import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { iosSimulatorAppBundleCheck } from "../src/ios-simulator-app-bundle.js";

test("iOS simulator app bundle check skips when build check skips", () => {
  const result = iosSimulatorAppBundleCheck({
    buildCheckFn: () => ({ status: "skipped", reason: "no simulator" }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no simulator");
});

test("iOS simulator app bundle check creates a minimal app bundle from executable artifact", () => {
  const root = mkdtempSync(path.join(tmpdir(), "hovvi-bundle-test-"));
  const derivedDataPath = path.join(root, "DerivedData");
  const artifact = path.join(root, "HovviMobileApp");
  const bundleRoot = path.join(root, "Bundle");
  writeFileSync(artifact, "binary");

  const result = iosSimulatorAppBundleCheck({
    keepBundle: true,
    tempDirFn: () => bundleRoot,
    buildCheckFn: () => ({
      status: "built",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      artifact,
      derivedDataPath,
    }),
  });

  assert.equal(result.status, "bundled");
  assert.equal(result.appBundle, path.join(bundleRoot, "HovviMobileApp.app"));
  assert.equal(readFileSync(path.join(result.appBundle, "HovviMobileApp"), "utf8"), "binary");
  const plist = readFileSync(path.join(result.appBundle, "Info.plist"), "utf8");
  assert.match(plist, /<key>CFBundleExecutable<\/key>/);
  assert.match(plist, /<string>HovviMobileApp<\/string>/);
  assert.equal(readFileSync(path.join(result.appBundle, "PkgInfo"), "utf8"), "APPL????");
});

test("iOS simulator app bundle check rejects non-absolute artifacts", () => {
  const result = iosSimulatorAppBundleCheck({
    buildCheckFn: () => ({
      status: "built",
      artifact: "HovviMobileApp",
      derivedDataPath: undefined,
    }),
  });

  assert.equal(result.status, "failed");
  assert.match(result.reason, /absolute artifact path/);
});
