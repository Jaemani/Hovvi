#!/usr/bin/env node
import { iosSimulatorPreflight } from "../src/ios-preflight.js";

const args = new Set(process.argv.slice(2));
const result = iosSimulatorPreflight();

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "ready") {
  console.log(`iOS simulator rendering preflight ready: ${result.simulatorCount} simulator(s) available.`);
} else {
  console.log(`Skipping iOS simulator rendering: ${result.reason}`);
}

if (args.has("--require-ready") && result.status !== "ready") {
  process.exit(1);
}
