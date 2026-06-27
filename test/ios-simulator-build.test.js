import test from "node:test";
import assert from "node:assert/strict";
import { iosSimulatorBuildCheck } from "../src/ios-simulator-build.js";

test("iOS simulator build check skips when preflight is not ready", () => {
  const result = iosSimulatorBuildCheck({
    preflightFn: () => ({ status: "skipped", reason: "no full Xcode" }),
  });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /Xcode/);
});

test("iOS simulator build check invokes xcodebuild for the selected simulator", () => {
  const calls = [];
  const result = iosSimulatorBuildCheck({
    cwd: "/repo",
    keepDerivedData: true,
    tempDirFn: () => "/tmp/hovvi-ios-sim-test",
    preflightFn: () => ({
      status: "ready",
      simulators: [{ name: "iPhone 17", udid: "SIM-1", runtime: "iOS" }],
    }),
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      return ok("build ok");
    },
    findAppBundleFn(root, bundleName) {
      assert.equal(root, "/tmp/hovvi-ios-sim-test/Build/Products");
      assert.equal(bundleName, "HovviMobileApp.app");
      return `${root}/Debug-iphonesimulator/${bundleName}`;
    },
  });

  assert.equal(result.status, "built");
  assert.equal(result.appBundle, "/tmp/hovvi-ios-sim-test/Build/Products/Debug-iphonesimulator/HovviMobileApp.app");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "xcodebuild");
  assert.deepEqual(calls[0].args, [
    "-scheme",
    "HovviMobileApp",
    "-destination",
    "id=SIM-1",
    "-derivedDataPath",
    "/tmp/hovvi-ios-sim-test",
    "build",
  ]);
  assert.equal(calls[0].options.cwd, "/repo/apps/ios");
  assert.equal(calls[0].options.timeout, 120000);
});

test("iOS simulator build check reports missing app bundle after a successful build", () => {
  const result = iosSimulatorBuildCheck({
    keepDerivedData: true,
    tempDirFn: () => "/tmp/hovvi-ios-sim-test",
    preflightFn: () => ({
      status: "ready",
      simulators: [{ name: "iPhone 17", udid: "SIM-1", runtime: "iOS" }],
    }),
    runTextFn: () => ok("build ok"),
    findAppBundleFn: () => null,
  });

  assert.equal(result.status, "failed");
  assert.match(result.reason, /not found/);
  assert.equal(result.derivedDataPath, "/tmp/hovvi-ios-sim-test");
});

function ok(text) {
  return {
    ok: true,
    status: 0,
    stdout: text,
    stderr: "",
    text,
  };
}
