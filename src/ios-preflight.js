import { commandExists, runText } from "./shell.js";

export function iosSimulatorPreflight({
  platform = process.platform,
  commandExistsFn = commandExists,
  runTextFn = runText,
  simctlAttempts = 3,
  simctlRetryDelayMs = 1000,
  waitFn = sleepSync,
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

  const simctl = readAvailableSimulatorJson({
    runTextFn,
    attempts: simctlAttempts,
    retryDelayMs: simctlRetryDelayMs,
    waitFn,
  });
  if (!simctl.ok) {
    return skipped(`simctl is not usable: ${simctl.text || simctl.stderr}`, {
      activeDeveloperDirectory,
      xcodebuild: xcodebuild.text,
      simctlAttempts: simctl.attempts,
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(simctl.jsonText);
  } catch (error) {
    return skipped(`Could not parse simctl device JSON: ${error.message}`, {
      activeDeveloperDirectory,
      xcodebuild: xcodebuild.text,
      simctlAttempts: simctl.attempts,
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

function readAvailableSimulatorJson({
  runTextFn,
  attempts,
  retryDelayMs,
  waitFn,
}) {
  const maxAttempts = Math.max(1, Number.isFinite(attempts) ? Math.trunc(attempts) : 1);
  let lastResult;
  let lastParseError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runTextFn("xcrun", ["simctl", "list", "devices", "available", "--json"], {
      timeout: 10000,
    });
    lastResult = result;
    if (result.ok) {
      const jsonText = result.stdout || result.text;
      try {
        JSON.parse(jsonText);
        return {
          ok: true,
          jsonText,
          attempts: attempt,
        };
      } catch (error) {
        lastParseError = error;
      }
    }
    if (attempt < maxAttempts) {
      waitFn(Math.max(0, retryDelayMs));
    }
  }
  if (lastResult?.ok && lastParseError) {
    return {
      ok: true,
      jsonText: lastResult.stdout || lastResult.text,
      attempts: maxAttempts,
    };
  }
  return {
    ok: false,
    attempts: maxAttempts,
    stdout: lastResult?.stdout ?? "",
    stderr: lastResult?.stderr ?? "",
    text: lastResult?.text ?? "",
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

function sleepSync(ms) {
  if (ms <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function skipped(reason, details = {}) {
  return {
    status: "skipped",
    reason,
    ...details,
  };
}
