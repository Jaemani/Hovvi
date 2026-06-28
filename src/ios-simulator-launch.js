import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import { iosSimulatorPreflight } from "./ios-preflight.js";
import { describeSimctlResult } from "./simctl-diagnostics.js";
import { runText } from "./shell.js";

export const HOVVI_IOS_BUNDLE_ID = "app.hovvi.mobile.alpha";
export const HOVVI_IOS_SNAPSHOT_FIXTURE_KEY = "HOVVI_IOS_SNAPSHOT_FIXTURE";

export function iosSimulatorLaunchCheck({
  fixture = "attached-coding-agent",
  installCheckFn = iosSimulatorInstallCheck,
  preflightFn = iosSimulatorPreflight,
  runTextFn = runText,
  reuseInstalledApp = false,
  launchTimeoutMs = 60000,
  terminateTimeoutMs = 15000,
} = {}) {
  if (reuseInstalledApp) {
    const preflight = preflightFn();
    if (preflight.status === "ready") {
      const simulator = preflight.simulators?.find((candidate) => candidate.state === "Booted")
        ?? preflight.simulators?.[0];
      if (simulator?.udid) {
        const installedLaunch = launchInstalledSimulatorApp({
          simulator,
          fixture,
          runTextFn,
          launchTimeoutMs,
          terminateTimeoutMs,
        });
        if (installedLaunch.status === "launched") {
          return {
            ...installedLaunch,
            reusedInstalledApp: true,
          };
        }
        if (shouldFallbackToInstallAfterLaunchFailure(installedLaunch) === false) {
          return {
            ...installedLaunch,
            reusedInstalledApp: true,
          };
        }
      }
    }
  }

  const install = installCheckFn();
  if (install.status !== "installed") {
    return install;
  }

  const udid = install.simulator?.udid;
  if (!udid) {
    return {
      status: "failed",
      reason: "iOS simulator install check did not return a simulator UDID.",
      install,
    };
  }

  return launchInstalledSimulatorApp({
    simulator: install.simulator,
    fixture,
    runTextFn,
    launchTimeoutMs,
    terminateTimeoutMs,
  });
}

function launchInstalledSimulatorApp({
  simulator,
  fixture,
  runTextFn,
  launchTimeoutMs,
  terminateTimeoutMs,
}) {
  const udid = simulator.udid;
  const launch = runTextFn(
    "xcrun",
    ["simctl", "launch", "--terminate-running-process", udid, HOVVI_IOS_BUNDLE_ID],
    {
      timeout: launchTimeoutMs,
      env: {
        ...process.env,
        [`SIMCTL_CHILD_${HOVVI_IOS_SNAPSHOT_FIXTURE_KEY}`]: fixture,
      },
    }
  );

  const terminate = runTextFn(
    "xcrun",
    ["simctl", "terminate", udid, HOVVI_IOS_BUNDLE_ID],
    { timeout: terminateTimeoutMs }
  );

  if (!launch.ok) {
    return {
      status: "failed",
      reason: "Could not launch HovviMobileApp on the selected iOS simulator.",
      simulator,
      simctl: describeSimctlResult(launch),
      terminate: describeSimctlResult(terminate),
    };
  }

  return {
    status: "launched",
    simulator,
    bundleId: HOVVI_IOS_BUNDLE_ID,
    fixture,
  };
}

function shouldFallbackToInstallAfterLaunchFailure(result) {
  return /not installed|application .*not found|failed to find|no such file/i.test(
    `${result?.reason ?? ""}\n${result?.simctl ?? ""}`
  );
}
