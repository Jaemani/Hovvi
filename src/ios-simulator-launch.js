import { iosSimulatorInstallCheck } from "./ios-simulator-install.js";
import { runText } from "./shell.js";

export const HOVVI_IOS_BUNDLE_ID = "app.hovvi.mobile.alpha";
export const HOVVI_IOS_SNAPSHOT_FIXTURE_KEY = "HOVVI_IOS_SNAPSHOT_FIXTURE";

export function iosSimulatorLaunchCheck({
  fixture = "attached-coding-agent",
  installCheckFn = iosSimulatorInstallCheck,
  runTextFn = runText,
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
      timeout: 120000,
      env: {
        ...process.env,
        [`SIMCTL_CHILD_${HOVVI_IOS_SNAPSHOT_FIXTURE_KEY}`]: fixture,
      },
    }
  );

  const terminate = runTextFn(
    "xcrun",
    ["simctl", "terminate", udid, HOVVI_IOS_BUNDLE_ID],
    { timeout: 30000 }
  );

  if (!launch.ok) {
    return {
      status: "failed",
      reason: "Could not launch HovviMobileApp on the selected iOS simulator.",
      simulator: install.simulator,
      simctl: launch.text,
      terminate: terminate.text,
    };
  }

  return {
    status: "launched",
    simulator: install.simulator,
    bundleId: HOVVI_IOS_BUNDLE_ID,
    fixture,
  };
}
