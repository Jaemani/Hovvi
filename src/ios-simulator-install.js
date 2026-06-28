import { rmSync } from "node:fs";
import { iosSimulatorAppBundleCheck } from "./ios-simulator-app-bundle.js";
import { runText } from "./shell.js";

export function iosSimulatorInstallCheck({
  bundleCheckFn = (options) => iosSimulatorAppBundleCheck(options),
  runTextFn = runText,
} = {}) {
  const bundle = bundleCheckFn({ keepBundle: true });
  if (bundle.status !== "bundled") {
    return bundle;
  }

  const udid = bundle.simulator?.udid;
  if (!udid) {
    cleanupBundle(bundle);
    return {
      status: "failed",
      reason: "iOS simulator bundle check did not return a simulator UDID.",
      bundle,
    };
  }

  const appBundle = bundle.appBundle;
  if (!appBundle || appBundle.endsWith(".app") === false) {
    cleanupBundle(bundle);
    return {
      status: "failed",
      reason: "iOS simulator bundle check did not return an app bundle path.",
      bundle,
    };
  }

  const boot = runTextFn("xcrun", ["simctl", "boot", udid], { timeout: 120000 });
  if (!boot.ok && isAlreadyBooted(boot.text) === false) {
    cleanupBundle(bundle);
    return {
      status: "failed",
      reason: "Could not boot the selected iOS simulator.",
      simulator: bundle.simulator,
      simctl: boot.text,
    };
  }

  const bootstatus = runTextFn("xcrun", ["simctl", "bootstatus", udid, "-b"], { timeout: 120000 });
  if (!bootstatus.ok) {
    cleanupBundle(bundle);
    return {
      status: "failed",
      reason: "Selected iOS simulator did not reach booted state.",
      simulator: bundle.simulator,
      simctl: bootstatus.text,
    };
  }

  const install = runTextFn("xcrun", ["simctl", "install", udid, appBundle], { timeout: 120000 });
  cleanupBundle(bundle);
  if (!install.ok) {
    return {
      status: "failed",
      reason: "Could not install HovviMobileApp.app on the selected iOS simulator.",
      simulator: bundle.simulator,
      simctl: install.text,
    };
  }

  return {
    status: "installed",
    simulator: bundle.simulator,
  };
}

function isAlreadyBooted(text) {
  return /already booted|current state.*booted/i.test(text ?? "");
}

function cleanupBundle(bundle) {
  if (bundle.bundleRoot) {
    rmSync(bundle.bundleRoot, { recursive: true, force: true });
  }
}
