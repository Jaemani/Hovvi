import test from "node:test";
import assert from "node:assert/strict";
import { iosSimulatorInstallCheck } from "../src/ios-simulator-install.js";

test("iOS simulator install check skips when bundle check skips", () => {
  const result = iosSimulatorInstallCheck({
    bundleCheckFn: () => ({ status: "skipped", reason: "no simulator" }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no simulator");
});

test("iOS simulator install check boots and installs the bundle", () => {
  const calls = [];
  const result = iosSimulatorInstallCheck({
    bundleCheckFn: () => ({
      status: "bundled",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      appBundle: "/tmp/HovviMobileApp.app",
    }),
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      return ok("");
    },
  });

  assert.equal(result.status, "installed");
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ["simctl", "boot", "SIM-1"],
      ["simctl", "bootstatus", "SIM-1", "-b"],
      ["simctl", "install", "SIM-1", "/tmp/HovviMobileApp.app"],
    ]
  );
});

test("iOS simulator install check tolerates an already booted simulator", () => {
  const result = iosSimulatorInstallCheck({
    bundleCheckFn: () => ({
      status: "bundled",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      appBundle: "/tmp/HovviMobileApp.app",
    }),
    runTextFn(command, args) {
      if (args[1] === "boot") {
        return failed("Unable to boot device in current state: Booted");
      }
      return ok("");
    },
  });

  assert.equal(result.status, "installed");
});

test("iOS simulator install check reports install failures", () => {
  const result = iosSimulatorInstallCheck({
    bundleCheckFn: () => ({
      status: "bundled",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      appBundle: "/tmp/HovviMobileApp.app",
    }),
    runTextFn(command, args) {
      if (args[1] === "install") {
        return failed("invalid bundle");
      }
      return ok("");
    },
  });

  assert.equal(result.status, "failed");
  assert.match(result.reason, /install/);
  assert.match(result.simctl, /invalid bundle/);
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
