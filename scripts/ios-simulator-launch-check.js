#!/usr/bin/env node
import { iosSimulatorLaunchCheck } from "../src/ios-simulator-launch.js";

const args = new Set(process.argv.slice(2));
const fixtureArg = process.argv.find((arg) => arg.startsWith("--fixture="));
const fixture = fixtureArg ? fixtureArg.slice("--fixture=".length) : undefined;
const result = iosSimulatorLaunchCheck({ fixture, reuseInstalledApp: true });

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "launched") {
  console.log(
    `iOS simulator launch ready: ${result.simulator.name} (${result.simulator.udid}) ${result.bundleId}`
  );
} else if (result.status === "failed") {
  console.error(`iOS simulator launch failed: ${result.reason}`);
  if (result.simctl) {
    console.error(result.simctl);
  }
} else {
  console.log(`Skipping iOS simulator launch: ${result.reason}`);
}

if (args.has("--require-launched") && result.status !== "launched") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}
