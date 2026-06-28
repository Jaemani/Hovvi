#!/usr/bin/env node
import { iosSimulatorInstallCheck } from "../src/ios-simulator-install.js";

const args = new Set(process.argv.slice(2));
const result = iosSimulatorInstallCheck();

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "installed") {
  console.log(`iOS simulator install ready: ${result.simulator.name} (${result.simulator.udid})`);
} else if (result.status === "failed") {
  console.error(`iOS simulator install failed: ${result.reason}`);
  if (result.simctl) {
    console.error(result.simctl);
  }
} else {
  console.log(`Skipping iOS simulator install: ${result.reason}`);
}

if (args.has("--require-installed") && result.status !== "installed") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}
