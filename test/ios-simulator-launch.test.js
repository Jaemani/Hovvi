import test from "node:test";
import assert from "node:assert/strict";
import {
  HOVVI_IOS_BUNDLE_ID,
  HOVVI_IOS_SNAPSHOT_FIXTURE_KEY,
  iosSimulatorLaunchCheck,
} from "../src/ios-simulator-launch.js";

test("iOS simulator launch check skips when install check skips", () => {
  const result = iosSimulatorLaunchCheck({
    installCheckFn: () => ({ status: "skipped", reason: "no simulator" }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no simulator");
});

test("iOS simulator launch check launches fixture and terminates app", () => {
  const calls = [];
  const result = iosSimulatorLaunchCheck({
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      return ok(args[1] === "launch" ? `${HOVVI_IOS_BUNDLE_ID}: 1234` : "");
    },
  });

  assert.equal(result.status, "launched");
  assert.equal(result.bundleId, HOVVI_IOS_BUNDLE_ID);
  assert.equal(result.fixture, "attached-coding-agent");
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ["simctl", "launch", "--terminate-running-process", "SIM-1", HOVVI_IOS_BUNDLE_ID],
      ["simctl", "terminate", "SIM-1", HOVVI_IOS_BUNDLE_ID],
    ]
  );
  assert.equal(
    calls[0].options.env[`SIMCTL_CHILD_${HOVVI_IOS_SNAPSHOT_FIXTURE_KEY}`],
    "attached-coding-agent"
  );
});

test("iOS simulator launch check accepts an explicit fixture", () => {
  const result = iosSimulatorLaunchCheck({
    fixture: "failed-reattach",
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    runTextFn: () => ok(""),
  });

  assert.equal(result.status, "launched");
  assert.equal(result.fixture, "failed-reattach");
});

test("iOS simulator launch check reports launch failures", () => {
  const result = iosSimulatorLaunchCheck({
    installCheckFn: () => ({
      status: "installed",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
    }),
    runTextFn(command, args) {
      if (args[1] === "launch") {
        return failed("failed to launch app");
      }
      return ok("");
    },
  });

  assert.equal(result.status, "failed");
  assert.match(result.reason, /launch/);
  assert.match(result.simctl, /failed to launch app/);
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
