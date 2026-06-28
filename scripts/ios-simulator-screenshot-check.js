#!/usr/bin/env node
import { iosSimulatorScreenshotCheck } from "../src/ios-simulator-screenshot.js";
import {
  formatScreenshotResult,
  parseIosSimulatorScreenshotArgs,
  writeScreenshotMetadata,
} from "../src/ios-simulator-screenshot-cli.js";

const options = parseIosSimulatorScreenshotArgs(process.argv.slice(2));
const result = iosSimulatorScreenshotCheck({
  fixture: options.fixture,
  keepScreenshot: options.keepScreenshot,
  outputPath: options.outputPath,
});
writeScreenshotMetadata(options.metadataPath, result);

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const formatted = formatScreenshotResult(result);
  if (formatted.stream === "stderr") {
    console.error(formatted.text);
  } else {
    console.log(formatted.text);
  }
}

if (options.requireCaptured && result.status !== "captured") {
  process.exit(1);
}

if (result.status === "failed") {
  process.exit(1);
}
