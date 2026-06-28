import { rmSync } from "node:fs";
import { iosSimulatorAppBundleCheck } from "./ios-simulator-app-bundle.js";
import { runText } from "./shell.js";

export function iosSimulatorInstallCheck({
  bundleCheckFn = (options) => iosSimulatorAppBundleCheck(options),
  runTextFn = runText,
  bootAttempts = 2,
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

  const boot = bootSimulator({ udid, runTextFn, attempts: bootAttempts });
  if (!boot.ok) {
    cleanupBundle(bundle);
    return {
      status: "failed",
      reason: boot.reason,
      simulator: bundle.simulator,
      simctl: boot.text,
      bootAttempts: boot.attempts,
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

function bootSimulator({ udid, runTextFn, attempts }) {
  const maxAttempts = Math.max(1, Number.isFinite(attempts) ? Math.trunc(attempts) : 1);
  let lastBoot;
  let lastBootstatus;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastBoot = runTextFn("xcrun", ["simctl", "boot", udid], { timeout: 120000 });
    if (!lastBoot.ok && isAlreadyBooted(lastBoot.text) === false) {
      return {
        ok: false,
        attempts: attempt,
        reason: "Could not boot the selected iOS simulator.",
        text: lastBoot.text,
      };
    }

    lastBootstatus = runTextFn("xcrun", ["simctl", "bootstatus", udid, "-b"], {
      timeout: 120000,
    });
    if (lastBootstatus.ok) {
      return {
        ok: true,
        attempts: attempt,
      };
    }

    if (attempt < maxAttempts) {
      runTextFn("xcrun", ["simctl", "shutdown", udid], { timeout: 30000 });
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    reason: "Selected iOS simulator did not reach booted state.",
    text: lastBootstatus?.text ?? lastBoot?.text ?? "",
  };
}

function cleanupBundle(bundle) {
  if (bundle.bundleRoot) {
    rmSync(bundle.bundleRoot, { recursive: true, force: true });
  }
}
