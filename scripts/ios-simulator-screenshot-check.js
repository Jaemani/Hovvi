#!/usr/bin/env node
import { iosSimulatorScreenshotCheck } from "../src/ios-simulator-screenshot.js";

const args = new Set(process.argv.slice(2));
const fixtureArg = process.argv.find((arg) => arg.startsWith("--fixture="));
const fixture = fixtureArg ? fixtureArg.slice("--fixture=".length) : undefined;
const keepScreenshot = args.has("--keep-screenshot");
const result = iosSimulatorScreenshotCheck({ fixture, keepScreenshot });

if (args.has("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.status === "captured") {
  console.log(
    `iOS simulator screenshot ready: ${result.image.width}x${result.image.height} ${result.bundleId}`
  );
  if (result.screenshot) {
    console.log(result.screenshot);
  }
} else if (result.status === "failed") {
  console.error(`iOS simulator screenshot failed: ${result.reason}`);
  if (result.simctl) {
    console.error(result.simctl);
  }
} else {
  console.log(`Skipping iOS simulator screenshot: ${result.reason}`);
}

if (args.has("--require-captured") && result.status !== "captured") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}
