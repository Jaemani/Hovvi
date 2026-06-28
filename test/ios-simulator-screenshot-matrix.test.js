import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES,
  iosSimulatorScreenshotMatrixCheck,
  safeFixtureName,
} from "../src/ios-simulator-screenshot-matrix.js";
import { HOVVI_IOS_BUNDLE_ID } from "../src/ios-simulator-launch.js";

test("iOS simulator screenshot matrix skips when install check skips", () => {
  const result = iosSimulatorScreenshotMatrixCheck({
    installCheckFn: () => ({ status: "skipped", reason: "no simulator" }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no simulator");
});

test("iOS simulator screenshot matrix reuses install and captures all fixtures", () => {
  const calls = [];
  let installCount = 0;
  const result = iosSimulatorScreenshotMatrixCheck({
    fixtures: ["browsing", "attached-coding-agent", "failed-attach"],
    outputDir: "/tmp/hovvi-ios-shot-matrix",
    waitMs: 0,
    waitFn: () => {},
    installCheckFn() {
      installCount += 1;
      return {
        status: "installed",
        simulator: { name: "iPhone 17", udid: "SIM-1" },
      };
    },
    readPngStatsFn(filePath) {
      assert.match(filePath, /\/tmp\/hovvi-ios-shot-matrix\/.+\.png$/);
      return {
        width: 1179,
        height: 2556,
        pixels: 3013524,
        uniqueColors: 64,
        nonBlank: true,
      };
    },
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      return ok(args[1] === "launch" ? `${HOVVI_IOS_BUNDLE_ID}: 1234` : "");
    },
  });

  assert.equal(result.status, "captured");
  assert.equal(installCount, 1);
  assert.deepEqual(result.fixtures, ["browsing", "attached-coding-agent", "failed-attach"]);
  assert.deepEqual(
    result.results.map((entry) => entry.screenshot),
    [
      "/tmp/hovvi-ios-shot-matrix/browsing.png",
      "/tmp/hovvi-ios-shot-matrix/attached-coding-agent.png",
      "/tmp/hovvi-ios-shot-matrix/failed-attach.png",
    ]
  );
  assert.deepEqual(
    calls
      .filter((call) => call.args[1] === "launch")
      .map((call) => call.options.env.SIMCTL_CHILD_HOVVI_IOS_SNAPSHOT_FIXTURE),
    ["browsing", "attached-coding-agent", "failed-attach"]
  );
});

test("iOS simulator screenshot matrix reports fixture failures", () => {
  const result = iosSimulatorScreenshotMatrixCheck({
    fixtures: ["browsing", "failed-attach"],
    outputDir: "/tmp/hovvi-ios-shot-matrix-failure",
    waitMs: 0,
    waitFn: () => {},
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    readPngStatsFn(filePath) {
      return {
        width: 1,
        height: 1,
        pixels: 1,
        uniqueColors: 1,
        nonBlank: filePath.includes("browsing"),
      };
    },
    runTextFn: () => ok(""),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.failureCount, 1);
  assert.match(result.reason, /1 iOS simulator screenshot fixture/);
});

test("iOS simulator screenshot matrix fixture names are stable", () => {
  assert.deepEqual(DEFAULT_IOS_SIMULATOR_SCREENSHOT_FIXTURES, [
    "browsing",
    "attached-coding-agent",
    "failed-attach",
  ]);
  assert.equal(safeFixtureName(" Failed Attach "), "failed-attach");
  assert.equal(safeFixtureName("A/B:C"), "a-b-c");
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
