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

function ok(text) {
  return {
    ok: true,
    status: 0,
    stdout: text,
    stderr: "",
    text,
  };
}
