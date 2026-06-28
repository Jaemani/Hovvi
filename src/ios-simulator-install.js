import { rmSync } from "node:fs";
import { iosSimulatorAppBundleCheck } from "./ios-simulator-app-bundle.js";
import { runText } from "./shell.js";

export function iosSimulatorInstallCheck({
  bundleCheckFn = (options) => iosSimulatorAppBundleCheck(options),
  runTextFn = runText,
  bootAttempts = 2,
  bootPolls = 24,
  bootPollIntervalMs = 5000,
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

  const boot = bootSimulator({
    udid,
    runTextFn,
    attempts: bootAttempts,
    polls: bootPolls,
    pollIntervalMs: bootPollIntervalMs,
  });
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

function bootSimulator({ udid, runTextFn, attempts, polls, pollIntervalMs }) {
  const maxAttempts = Math.max(1, Number.isFinite(attempts) ? Math.trunc(attempts) : 1);
  let lastBoot;
  let lastStatus;
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

    lastStatus = waitForBootedSimulator({ udid, runTextFn, polls, pollIntervalMs });
    if (lastStatus.ok) {
      return {
        ok: true,
        attempts: attempt,
        polls: lastStatus.polls,
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
    text: lastStatus?.text ?? lastBoot?.text ?? "",
  };
}

function waitForBootedSimulator({ udid, runTextFn, polls, pollIntervalMs }) {
  const maxPolls = Math.max(1, Number.isFinite(polls) ? Math.trunc(polls) : 1);
  const intervalMs = Math.max(0, Number.isFinite(pollIntervalMs) ? Math.trunc(pollIntervalMs) : 0);
  let lastText = "";
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const status = runTextFn("xcrun", ["simctl", "list", "devices", "--json"], { timeout: 30000 });
    lastText = status.text;
    if (status.ok && simulatorState(status.text, udid) === "Booted") {
      return { ok: true, polls: poll, text: status.text };
    }
    if (poll < maxPolls && intervalMs > 0) sleep(intervalMs);
  }
  return { ok: false, polls: maxPolls, text: lastText };
}

function simulatorState(text, udid) {
  try {
    const parsed = JSON.parse(text || "{}");
    for (const devices of Object.values(parsed.devices || {})) {
      if (!Array.isArray(devices)) continue;
      const match = devices.find((device) => device.udid === udid);
      if (match) return match.state;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanupBundle(bundle) {
  if (bundle.bundleRoot) {
    rmSync(bundle.bundleRoot, { recursive: true, force: true });
  }
}
