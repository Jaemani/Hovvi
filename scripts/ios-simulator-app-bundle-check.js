#!/usr/bin/env node
import { iosSimulatorAppBundleCheck } from "../src/ios-simulator-app-bundle.js";

const args = new Set(process.argv.slice(2));
const result = iosSimulatorAppBundleCheck({
  keepBundle: args.has("--keep-bundle"),
});

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "bundled") {
  console.log(`iOS simulator app bundle ready: ${result.appBundle}`);
} else if (result.status === "failed") {
  console.error(`iOS simulator app bundle failed: ${result.reason}`);
} else {
  console.log(`Skipping iOS simulator app bundle: ${result.reason}`);
}

if (args.has("--require-bundled") && result.status !== "bundled") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}
