#!/usr/bin/env node
import { iosSimulatorBuildCheck } from "../src/ios-simulator-build.js";

const args = new Set(process.argv.slice(2));
const result = iosSimulatorBuildCheck({
  keepDerivedData: args.has("--keep-derived-data"),
});

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "built") {
  console.log(`iOS simulator app build ready: ${result.appBundle}`);
} else if (result.status === "failed") {
  console.error(`iOS simulator app build failed: ${result.reason}`);
  if (result.xcodebuild) {
    console.error(result.xcodebuild);
  }
} else {
  console.log(`Skipping iOS simulator app build: ${result.reason}`);
}

if (args.has("--require-built") && result.status !== "built") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}
