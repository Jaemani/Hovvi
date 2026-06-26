import { commandExists, runText } from "./shell.js";

export function iosSimulatorPreflight({
  platform = process.platform,
  commandExistsFn = commandExists,
  runTextFn = runText,
} = {}) {
  if (platform !== "darwin") {
    return skipped("iOS simulator rendering requires macOS.");
  }

  if (!commandExistsFn("xcode-select")) {
    return skipped("xcode-select is not available.");
  }

  const developerDir = runTextFn("xcode-select", ["-p"]);
  if (!developerDir.ok) {
    return skipped(`Could not read active developer directory: ${developerDir.text || developerDir.stderr}`);
  }

  const activeDeveloperDirectory = developerDir.text.trim();
  if (activeDeveloperDirectory.includes("/CommandLineTools")) {
    return skipped("Active developer directory is Command Line Tools, not full Xcode.", {
      activeDeveloperDirectory,
    });
  }

  const xcodebuild = runTextFn("xcodebuild", ["-version"]);
  if (!xcodebuild.ok) {
    return skipped(`xcodebuild is not usable: ${xcodebuild.text || xcodebuild.stderr}`, {
      activeDeveloperDirectory,
    });
  }

  if (!commandExistsFn("xcrun")) {
    return skipped("xcrun is not available.", {
      activeDeveloperDirectory,
      xcodebuild: xcodebuild.text,
    });
  }

  const simctl = runTextFn("xcrun", ["simctl", "list", "devices", "available", "--json"], {
    timeout: 10000,
  });
  if (!simctl.ok) {
    return skipped(`simctl is not usable: ${simctl.text || simctl.stderr}`, {
      activeDeveloperDirectory,
      xcodebuild: xcodebuild.text,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(simctl.stdout || simctl.text);
  } catch (error) {
    return skipped(`Could not parse simctl device JSON: ${error.message}`, {
      activeDeveloperDirectory,
      xcodebuild: xcodebuild.text,
    });
  }

  const devices = availableSimulators(parsed);
  if (devices.length === 0) {
    return skipped("No available iOS simulator devices were found.", {
      activeDeveloperDirectory,
      xcodebuild: xcodebuild.text,
    });
  }

  return {
    status: "ready",
    activeDeveloperDirectory,
    xcodebuild: xcodebuild.text,
    simulatorCount: devices.length,
    simulators: devices,
  };
}

function availableSimulators(simctlDevices) {
  const runtimes = simctlDevices.devices ?? {};
  return Object.entries(runtimes)
    .filter(([runtime]) => runtime.includes("iOS"))
    .flatMap(([runtime, devices]) =>
      devices
        .filter((device) => device.isAvailable !== false)
        .map((device) => ({
          runtime,
          name: device.name,
          udid: device.udid,
          state: device.state,
        }))
    );
}

function skipped(reason, details = {}) {
  return {
    status: "skipped",
    reason,
    ...details,
  };
}
