import test from "node:test";
import assert from "node:assert/strict";
import { iosSimulatorPreflight } from "../src/ios-preflight.js";

test("iOS simulator preflight skips non-macOS environments", () => {
  const result = iosSimulatorPreflight({ platform: "linux" });

  assert.equal(result.status, "skipped");
  assert.match(result.reason, /macOS/);
});

test("iOS simulator preflight skips Command Line Tools without failing CI", () => {
  const result = iosSimulatorPreflight({
    platform: "darwin",
    commandExistsFn: () => true,
    runTextFn(command, args) {
      if (command === "xcode-select" && args[0] === "-p") {
        return ok("/Library/Developer/CommandLineTools");
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.activeDeveloperDirectory, "/Library/Developer/CommandLineTools");
  assert.match(result.reason, /Command Line Tools/);
});

test("iOS simulator preflight reports ready with available iOS simulators", () => {
  const result = iosSimulatorPreflight({
    platform: "darwin",
    commandExistsFn: () => true,
    runTextFn(command, args) {
      if (command === "xcode-select" && args[0] === "-p") {
        return ok("/Applications/Xcode.app/Contents/Developer");
      }
      if (command === "xcodebuild" && args[0] === "-version") {
        return ok("Xcode 17.0\nBuild version 17A000");
      }
      if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
        return ok(
          JSON.stringify({
            devices: {
              "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
                {
                  name: "iPhone 17",
                  udid: "SIM-1",
                  state: "Shutdown",
                  isAvailable: true,
                },
              ],
              "com.apple.CoreSimulator.SimRuntime.watchOS-26-0": [
                {
                  name: "Apple Watch",
                  udid: "WATCH-1",
                  state: "Shutdown",
                  isAvailable: true,
                },
              ],
            },
          })
        );
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.simulatorCount, 1);
  assert.deepEqual(result.simulators[0], {
    runtime: "com.apple.CoreSimulator.SimRuntime.iOS-26-0",
    name: "iPhone 17",
    udid: "SIM-1",
    state: "Shutdown",
  });
});

test("iOS simulator preflight retries transient simctl failures", () => {
  let simctlCalls = 0;
  const waits = [];
  const result = iosSimulatorPreflight({
    platform: "darwin",
    commandExistsFn: () => true,
    simctlRetryDelayMs: 0,
    waitFn: (ms) => waits.push(ms),
    runTextFn(command, args) {
      if (command === "xcode-select" && args[0] === "-p") {
        return ok("/Applications/Xcode.app/Contents/Developer");
      }
      if (command === "xcodebuild" && args[0] === "-version") {
        return ok("Xcode 17.0\nBuild version 17A000");
      }
      if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
        simctlCalls += 1;
        if (simctlCalls === 1) {
          return fail("CoreSimulatorService is restarting");
        }
        return ok(iosDeviceJson());
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(simctlCalls, 2);
  assert.deepEqual(waits, [0]);
});

test("iOS simulator preflight retries transient xcodebuild failures with a bounded timeout", () => {
  let xcodebuildCalls = 0;
  const waits = [];
  const timeouts = [];
  const result = iosSimulatorPreflight({
    platform: "darwin",
    commandExistsFn: () => true,
    xcodebuildAttempts: 3,
    xcodebuildRetryDelayMs: 25,
    xcodebuildTimeoutMs: 30000,
    simctlRetryDelayMs: 0,
    waitFn: (ms) => waits.push(ms),
    runTextFn(command, args, options = {}) {
      if (command === "xcode-select" && args[0] === "-p") {
        return ok("/Applications/Xcode.app/Contents/Developer");
      }
      if (command === "xcodebuild" && args[0] === "-version") {
        xcodebuildCalls += 1;
        timeouts.push(options.timeout);
        if (xcodebuildCalls < 3) {
          return fail("");
        }
        return ok("Xcode 17.0\nBuild version 17A000");
      }
      if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
        return ok(iosDeviceJson());
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(xcodebuildCalls, 3);
  assert.deepEqual(timeouts, [30000, 30000, 30000]);
  assert.deepEqual(waits, [25, 25]);
});

test("iOS simulator preflight reports xcodebuild attempt count after retries fail", () => {
  const result = iosSimulatorPreflight({
    platform: "darwin",
    commandExistsFn: () => true,
    xcodebuildAttempts: 2,
    xcodebuildRetryDelayMs: 0,
    waitFn: () => {},
    runTextFn(command, args) {
      if (command === "xcode-select" && args[0] === "-p") {
        return ok("/Applications/Xcode.app/Contents/Developer");
      }
      if (command === "xcodebuild" && args[0] === "-version") {
        return fail("developer tools are busy");
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.xcodebuildAttempts, 2);
  assert.match(result.reason, /developer tools are busy/);
});

test("iOS simulator preflight retries transient simctl JSON parse failures", () => {
  let simctlCalls = 0;
  const result = iosSimulatorPreflight({
    platform: "darwin",
    commandExistsFn: () => true,
    simctlRetryDelayMs: 0,
    waitFn: () => {},
    runTextFn(command, args) {
      if (command === "xcode-select" && args[0] === "-p") {
        return ok("/Applications/Xcode.app/Contents/Developer");
      }
      if (command === "xcodebuild" && args[0] === "-version") {
        return ok("Xcode 17.0\nBuild version 17A000");
      }
      if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
        simctlCalls += 1;
        return ok(simctlCalls === 1 ? "{" : iosDeviceJson());
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(simctlCalls, 2);
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

function fail(text) {
  return {
    ok: false,
    status: 1,
    stdout: "",
    stderr: text,
    text,
  };
}

function iosDeviceJson() {
  return JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
        {
          name: "iPhone 17",
          udid: "SIM-1",
          state: "Shutdown",
          isAvailable: true,
        },
      ],
    },
  });
}
