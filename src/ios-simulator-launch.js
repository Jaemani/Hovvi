import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import { describeSimctlResult } from "./simctl-diagnostics.js";
import { runText } from "./shell.js";

export const HOVVI_IOS_BUNDLE_ID = "app.hovvi.mobile.alpha";
export const HOVVI_IOS_SNAPSHOT_FIXTURE_KEY = "HOVVI_IOS_SNAPSHOT_FIXTURE";

export function iosSimulatorLaunchCheck({
  fixture = "attached-coding-agent",
  installCheckFn = iosSimulatorInstallCheck,
  runTextFn = runText,
  launchTimeoutMs = 60000,
  terminateTimeoutMs = 15000,
} = {}) {
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
      simulator: install.simulator,
      simctl: describeSimctlResult(launch),
      terminate: describeSimctlResult(terminate),
    };
  }

  return {
    status: "launched",
    simulator: install.simulator,
    bundleId: HOVVI_IOS_BUNDLE_ID,
    fixture,
  };
}
