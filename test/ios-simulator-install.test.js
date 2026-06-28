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
      if (args[1] === "list") {
        return ok(simulatorList("Booted"));
      }
      return ok("");
    },
  });

  assert.equal(result.status, "installed");
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ["simctl", "boot", "SIM-1"],
      ["simctl", "list", "devices", "--json"],
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
      if (args[1] === "list") {
        return ok(simulatorList("Booted"));
      }
      return ok("");
    },
  });

  assert.equal(result.status, "installed");
});

test("iOS simulator install check polls simulator state until booted", () => {
  const calls = [];
  let listCalls = 0;
  const result = iosSimulatorInstallCheck({
    bootPollIntervalMs: 0,
    bundleCheckFn: () => ({
      status: "bundled",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      appBundle: "/tmp/HovviMobileApp.app",
    }),
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      if (args[1] === "list") {
        listCalls += 1;
        return ok(simulatorList(listCalls === 1 ? "Booting" : "Booted"));
      }
      return ok("");
    },
  });

  assert.equal(result.status, "installed");
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ["simctl", "boot", "SIM-1"],
      ["simctl", "list", "devices", "--json"],
      ["simctl", "list", "devices", "--json"],
      ["simctl", "install", "SIM-1", "/tmp/HovviMobileApp.app"],
    ]
  );
});

test("iOS simulator install check retries boot when simulator never reaches booted state", () => {
  const calls = [];
  const result = iosSimulatorInstallCheck({
    bootAttempts: 2,
    bootPolls: 1,
    bootPollIntervalMs: 0,
    bundleCheckFn: () => ({
      status: "bundled",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      appBundle: "/tmp/HovviMobileApp.app",
    }),
    runTextFn(command, args, options) {
      calls.push({ command, args, options });
      if (args[1] === "list") {
        return ok(simulatorList("Booting"));
      }
      return ok("");
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.reason, "Selected iOS simulator did not reach booted state.");
  assert.equal(result.bootAttempts, 2);
  assert.match(result.simctl, /Booting/);
  assert.deepEqual(
    calls.map((call) => call.args),
    [
      ["simctl", "boot", "SIM-1"],
      ["simctl", "list", "devices", "--json"],
      ["simctl", "shutdown", "SIM-1"],
      ["simctl", "boot", "SIM-1"],
      ["simctl", "list", "devices", "--json"],
    ]
  );
});

test("iOS simulator install check reports install failures", () => {
  const result = iosSimulatorInstallCheck({
    bundleCheckFn: () => ({
      status: "bundled",
      simulator: { name: "iPhone 17", udid: "SIM-1" },
      appBundle: "/tmp/HovviMobileApp.app",
    }),
    runTextFn(command, args) {
      if (args[1] === "list") {
        return ok(simulatorList("Booted"));
      }
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

function simulatorList(state) {
  return JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [
        {
          name: "iPhone 17",
          udid: "SIM-1",
          state,
          isAvailable: true,
        },
      ],
    },
  });
}
