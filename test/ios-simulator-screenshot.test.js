import test from "node:test";
import assert from "node:assert/strict";
import { iosSimulatorScreenshotCheck } from "../src/ios-simulator-screenshot.js";
import { HOVVI_IOS_BUNDLE_ID } from "../src/ios-simulator-launch.js";

test("iOS simulator screenshot check skips when install check skips", () => {
  const result = iosSimulatorScreenshotCheck({
    installCheckFn: () => ({ status: "skipped", reason: "no simulator" }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no simulator");
});

test("iOS simulator screenshot check launches, captures, validates, and terminates", () => {
  const calls = [];
  const result = iosSimulatorScreenshotCheck({
    waitMs: 0,
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    tempDirFn: () => "/tmp/hovvi-ios-shot-test",
    waitFn: () => {},
    readPngStatsFn(filePath) {
      assert.equal(filePath, "/tmp/hovvi-ios-shot-test/hovvi-ios-screenshot.png");
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
  assert.equal(result.bundleId, HOVVI_IOS_BUNDLE_ID);
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ["simctl", "launch", "--terminate-running-process", "SIM-1", HOVVI_IOS_BUNDLE_ID],
      ["simctl", "io", "SIM-1", "screenshot", "/tmp/hovvi-ios-shot-test/hovvi-ios-screenshot.png"],
      ["simctl", "terminate", "SIM-1", HOVVI_IOS_BUNDLE_ID],
    ]
  );
  assert.deepEqual(
    calls.map((call) => call.options?.timeout),
    [60000, 60000, 15000]
  );
});

test("iOS simulator screenshot check reports blank screenshots", () => {
  const result = iosSimulatorScreenshotCheck({
    waitMs: 0,
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    tempDirFn: () => "/tmp/hovvi-ios-shot-test",
    waitFn: () => {},
    readPngStatsFn: () => ({ width: 1, height: 1, pixels: 1, uniqueColors: 1, nonBlank: false }),
    runTextFn: () => ok(""),
  });

  assert.equal(result.status, "failed");
  assert.match(result.reason, /blank/);
});

test("iOS simulator screenshot check reports screenshot command failures", () => {
  const result = iosSimulatorScreenshotCheck({
    waitMs: 0,
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    tempDirFn: () => "/tmp/hovvi-ios-shot-test",
    waitFn: () => {},
    runTextFn(command, args) {
      if (args[1] === "io") {
        return failed("screenshot failed");
      }
      return ok("");
    },
  });

  assert.equal(result.status, "failed");
  assert.match(result.reason, /screenshot/);
  assert.match(result.simctl, /screenshot failed/);
});

test("iOS simulator screenshot check reports simctl screenshot timeouts", () => {
  const result = iosSimulatorScreenshotCheck({
    waitMs: 0,
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    tempDirFn: () => "/tmp/hovvi-ios-shot-test",
    waitFn: () => {},
    runTextFn(command, args) {
      if (args[1] === "io") {
        return {
          ok: false,
          status: null,
          stdout: "",
          stderr: "",
          text: "",
          error: { code: "ETIMEDOUT", timeout: 60000 },
        };
      }
      return ok("");
    },
  });

  assert.equal(result.status, "failed");
  assert.match(result.simctl, /timed out after 60000ms/);
});

test("iOS simulator screenshot check preserves explicit output path", () => {
  const result = iosSimulatorScreenshotCheck({
    outputPath: "/tmp/hovvi-ios-shot-output/custom.png",
    waitMs: 0,
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    waitFn: () => {},
    readPngStatsFn: () => ({ width: 2, height: 2, pixels: 4, uniqueColors: 2, nonBlank: true }),
    runTextFn: () => ok(""),
  });

  assert.equal(result.status, "captured");
  assert.equal(result.screenshot, "/tmp/hovvi-ios-shot-output/custom.png");
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

function failed(text) {
  return {
    ok: false,
    status: 1,
    stdout: "",
    stderr: text,
    text,
  };
}
